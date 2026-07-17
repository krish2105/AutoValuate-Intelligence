import type {
  BackendValuationRequest, Condition, TraceStep, Valuation, ValuationResult,
  VehicleAttributes, VehicleInput,
} from "./types";
import { demoResult } from "./demo";
import { EMPTY_PHOTO_SET_HASH } from "./cv/hashes";

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
 * The only fields that describe the car to the backend. An explicit allowlist, not a
 * subtraction.
 *
 * This distinction is the whole point. The previous implementation was
 * `const { asking_price_aed, ...rest } = v` — it removed the one field it remembered and
 * forwarded everything else, so `photos` (up to 8 base64 data URLs) was POSTed to
 * /valuate/stream on every valuation while the UI, the manifest, the pricing page and the
 * README all promised "photos never leave your device". Omission-based filtering fails
 * open: every field added to the form ships by default until someone notices. An
 * allowlist fails closed — a new private field is simply never sent.
 */
const VEHICLE_ATTRIBUTE_KEYS = [
  "make", "model", "year", "kilometers", "bodyType", "transmissionType",
  "fuelType", "regionalSpecs", "noOfCylinders", "city", "sellerType",
] as const satisfies readonly (keyof VehicleAttributes)[];

/**
 * Build the wire payload: vehicle attributes + the derived on-device condition + photo
 * provenance. Never includes photo bytes, data URLs, object URLs, or filenames.
 *
 * `asking_price_aed` stays out for the original reason: sending it would let the valuation
 * anchor to the seller's number — the exact bias the product exists to counter — and would
 * persist a private figure into saved and shared reports for no benefit.
 */
export function toBackendRequest(v: VehicleInput): BackendValuationRequest {
  const out = {} as Record<string, unknown>;
  for (const k of VEHICLE_ATTRIBUTE_KEYS) {
    if (v[k] !== undefined) out[k] = v[k];
  }
  const req = out as unknown as BackendValuationRequest;

  req.photo_count = v.photos?.length ?? 0;
  // The condition already carries the hash of the set it was computed from; reusing it
  // keeps the two from disagreeing. With no scan there is no set to identify.
  req.photo_set_hash = v.client_condition?.photo_set_hash ?? EMPTY_PHOTO_SET_HASH;
  if (v.client_condition) req.client_condition = v.client_condition;
  return req;
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
      body: JSON.stringify(toBackendRequest(input)),
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
      body: JSON.stringify(toBackendRequest(input)),
      signal: signal ?? AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j?.ok && j.valuation ? (j.valuation as Valuation) : null;
  } catch {
    return null;
  }
}

/**
 * Bulk model-only valuation for the dealer dashboard (WS E2): one request values the
 * whole fleet — one rate-limit unit instead of N sequential calls. Returns null when
 * the endpoint is unavailable (older deployed backend, fleet over the 100-row cap) so
 * the caller can fall back to per-row estimates.
 */
export async function estimateBatch(
  inputs: VehicleInput[],
  timeoutMs = 120_000,
): Promise<(Valuation | null)[] | null> {
  try {
    const res = await fetch(`${API}/estimate/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicles: inputs.map(toBackendRequest) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const j = await res.json();
    if (!j?.ok || !Array.isArray(j.results)) return null;
    return j.results.map((r: { ok?: boolean; valuation?: Valuation }) =>
      r?.ok && r.valuation ? r.valuation : null);
  } catch {
    return null;
  }
}

export interface DepreciationPoint { age: number; price: number; km: number; year: number }
export interface DepreciationData {
  scope: "model" | "make";
  make: string;
  model: string;
  n: number;
  reference_year: number;
  points: DepreciationPoint[];
  median: { age: number; price: number; n: number }[];
}

/**
 * Corpus price-vs-age points for the depreciation curve (WS E3). The backend scopes to
 * the exact model when it has enough listings and widens to the make otherwise — the
 * `scope` field says which, and the card must surface it. Returns null on any failure
 * (cold backend, older deployed API) so the card simply doesn't render.
 */
export async function fetchDepreciation(
  make: string,
  model: string,
  timeoutMs = 15_000,
): Promise<DepreciationData | null> {
  try {
    const qs = `make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`;
    const res = await fetch(`${API}/market/depreciation?${qs}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j?.ok && Array.isArray(j.points) ? (j as DepreciationData) : null;
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

/**
 * Fire-and-forget wake-up ping. Render's free tier sleeps after 15 minutes idle and takes
 * ~50s to cold-start; we kick it awake the moment the page loads so it is ready by the time
 * the user submits, instead of the user paying the cold start (or, worse, being silently
 * handed demo data because the health probe timed out).
 */
export function wakeBackend(): void {
  fetch(`${API}/health`, { cache: "no-store", signal: AbortSignal.timeout(120_000) }).catch(() => {});
}

export async function apiInfo(): Promise<{ online: boolean; llm: boolean; cv: boolean }> {
  try {
    // short timeout so a cold/asleep backend never hangs the page
    const res = await fetch(`${API}/`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    const j = await res.json();
    // `cv` = the SERVER-side detector. It is not what users get: the production scan runs
    // on-device, so this can be false while damage assessment works perfectly.
    return { online: true, llm: !!j.llm_provider_configured, cv: !!j.cv_server_side_enabled };
  } catch {
    return { online: false, llm: false, cv: false };
  }
}
