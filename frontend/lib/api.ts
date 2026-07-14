import type { TraceStep, ValuationResult, VehicleInput } from "./types";
import { demoResult } from "./demo";

// Deployed default = the live Render API; local dev overrides via .env.local (localhost).
const API = process.env.NEXT_PUBLIC_API_URL || "https://autovaluate-api.onrender.com";
const DEFAULT_TIMEOUT_MS = 90_000; // generous for a Render cold start

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
) {
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
      else h.onResult(data as ValuationResult, false);
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
  const result = demoResult(input);
  for (const step of result.trace) {
    await new Promise((r) => setTimeout(r, 480));
    h.onStep(step);
  }
  await new Promise((r) => setTimeout(r, 300));
  h.onResult(result, true);
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
