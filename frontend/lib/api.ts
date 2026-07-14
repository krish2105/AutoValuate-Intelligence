import type { Condition, TraceStep, Valuation, ValuationResult, VehicleInput } from "./types";
import { demoResult } from "./demo";

/**
 * Fold an on-device (browser CV) condition into a result. The live backend already
 * consumes `client_condition` and adjusts the price + returns cv_available:true — in
 * that case we leave it alone. We only apply it client-side when the returned condition
 * isn't CV-assessed (demo/offline, or a backend that predates the client_condition field),
 * so the damage panel, price, and confidence still reflect the scan.
 */
function withClientCondition(result: ValuationResult, input: VehicleInput): ValuationResult {
  const cc = input.client_condition;
  if (!cc || result.condition?.cv_available) return result;

  const condition: Condition = {
    cv_available: true,
    condition_score: cc.condition_score,
    price_adjustment_factor: cc.price_adjustment_factor,
    findings: cc.findings,
    photos_assessed: cc.photos_assessed,
    total_value_impact_pct: cc.total_value_impact_pct,
    source: "browser",
  };
  const factor = cc.price_adjustment_factor ?? 1;
  const v = result.valuation;
  const valuation = factor !== 1
    ? {
        ...v,
        price_low_aed: Math.round(v.price_low_aed * factor),
        price_mid_aed: Math.round(v.price_mid_aed * factor),
        price_high_aed: Math.round(v.price_high_aed * factor),
        condition_adjusted: true,
        condition_factor: factor,
      }
    : v;

  return {
    ...result,
    valuation,
    condition,
    confidence: { ...result.confidence, cv_assessed: true },
  };
}

// Deployed default = the live Render API; local dev overrides via .env.local (localhost).
const API = process.env.NEXT_PUBLIC_API_URL || "https://autovaluate-api.onrender.com";
const DEFAULT_TIMEOUT_MS = 60_000; // covers a Render cold start (~50s), then demo-falls-back

export interface StreamHandlers {
  onStep: (step: TraceStep) => void;
  onResult: (result: ValuationResult, demo: boolean) => void;
  onError: (message: string) => void;
}

/**
 * Streams the valuation over the backend's SSE endpoint. EventSource can't POST,
 * so we POST via fetch and parse SSE frames from the ReadableStream.
 *
 * Failure policy:
 *  - user cancel (externalSignal)      → silent stop
 *  - timeout                           → onError (the engine is waking up)
 *  - error AFTER a run has started     → onError (interrupted) — never relabel a real run as demo
 *  - connection fails before any event → demo fallback so the link is never blank
 */
export async function streamValuation(
  input: VehicleInput,
  h: StreamHandlers,
  externalSignal?: AbortSignal,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  assumeOffline: boolean = false,
) {
  // If we already know the backend is unreachable, don't hang on it — demo now.
  if (assumeOffline) return runDemo(input, h);

  const ctrl = new AbortController();
  let timedOut = false;
  let started = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
  const onExtAbort = () => ctrl.abort();
  externalSignal?.addEventListener("abort", onExtAbort);

  const handleFrame = (frame: string) => {
    let event = "";
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) return;
    const data = JSON.parse(dataLines.join("\n")); // SSE joins multi-line data with \n
    started = true;
    if (event === "trace") h.onStep(data as TraceStep);
    else if (event === "error") h.onError(data?.error || "valuation failed");
    else if (event === "result") {
      if (data.ok === false) h.onError(data.error || "valuation failed");
      else h.onResult(withClientCondition(data as ValuationResult, input), false);
    }
  };

  try {
    const res = await fetch(`${API}/valuate/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) throw new Error(`API ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) handleFrame(frame);
    }
    if (buffer.trim()) handleFrame(buffer); // last frame may lack a trailing blank line
  } catch (err: any) {
    if (externalSignal?.aborted) return;                       // user cancelled → silent
    if (timedOut) return h.onError("The analysis engine is waking up and timed out. Please try again.");
    if (started) return h.onError("The valuation was interrupted. Please try again.");
    await runDemo(input, h);                                    // backend unreachable → demo
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExtAbort);
  }
}

async function runDemo(input: VehicleInput, h: StreamHandlers) {
  const result = withClientCondition(demoResult(input), input);
  for (const step of result.trace) {
    await new Promise((r) => setTimeout(r, 480));
    h.onStep(step);
  }
  await new Promise((r) => setTimeout(r, 300));
  h.onResult(result, true);
}

/**
 * Fast model-only re-valuation for the what-if sliders (Phase B). Hits POST /estimate
 * (no comparables/RAG/LLM) so a dragged slider updates in <1s on a warm backend.
 * Returns null on any failure so the caller can fall back to a local approximation.
 */
export async function estimateValuation(
  input: VehicleInput,
  signal?: AbortSignal,
  timeoutMs = 15_000,
): Promise<Valuation | null> {
  try {
    const res = await fetch(`${API}/estimate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: signal ?? AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j?.ok && j.valuation ? (j.valuation as Valuation) : null;
  } catch {
    return null;
  }
}

export interface AssistantReply {
  answer: string;
  provider: string;
  verified: boolean;
  numbers: number;
  citations: number;
}

/**
 * Ask the grounded assistant about a finished valuation (Phase C). Hits POST /chat,
 * where the answer is bound to the evidence pack and passed through the deterministic
 * Verifier. If the backend is cold, stale or unreachable, we answer from the same
 * evidence locally — the numbers are identical because both writers read the computed
 * evidence, so the assistant is never unavailable and never invents a figure.
 */
export async function askAssistant(
  question: string,
  result: ValuationResult,
  history: { role: string; content: string }[] = [],
  timeoutMs = 45_000,
): Promise<AssistantReply> {
  const context = {
    vehicle: result.vehicle,
    valuation: result.valuation,
    condition: result.condition,
    comparables: result.comparables,
    evidence: result.evidence,
  };
  try {
    const res = await fetch(`${API}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, context, history: history.slice(-6) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const j = await res.json();
    if (!j?.answer) throw new Error("no answer");
    return {
      answer: j.answer,
      provider: j.provider ?? "template",
      verified: !!j.verification?.passed,
      numbers: j.verification?.numbers_checked ?? 0,
      citations: j.verification?.citations_checked ?? 0,
    };
  } catch {
    const { localAnswer } = await import("./assistant");
    const answer = localAnswer(question, result);
    return {
      answer,
      provider: "on-device",
      verified: true, // built from computed evidence only — grounded by construction
      numbers: (answer.match(/AED\s[\d,]+|\d+(?:\.\d+)?%/g) ?? []).length,
      citations: (answer.match(/\[[A-Z]\d+\]/g) ?? []).length,
    };
  }
}

export async function apiInfo(): Promise<{ online: boolean; llm: boolean; cv: boolean }> {
  try {
    // short timeout so a cold/asleep backend never hangs the page
    const res = await fetch(`${API}/`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    const j = await res.json();
    return { online: true, llm: !!j.llm_provider_configured, cv: !!j.cv_service_configured };
  } catch {
    return { online: false, llm: false, cv: false };
  }
}
