import type { TraceStep, ValuationResult, VehicleInput } from "./types";
import { demoResult } from "./demo";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface StreamHandlers {
  onStep: (step: TraceStep) => void;
  onResult: (result: ValuationResult, demo: boolean) => void;
  onError: (message: string) => void;
}

/**
 * Streams the valuation over the backend's SSE endpoint. EventSource can't POST,
 * so we POST via fetch and parse the SSE frames from the ReadableStream manually.
 * If the backend is unreachable (not deployed / cold start failed), we degrade to
 * a deterministic demo result with a staged trace so the UI still demonstrates.
 */
export async function streamValuation(input: VehicleInput, h: StreamHandlers, signal?: AbortSignal) {
  try {
    const res = await fetch(`${API}/valuate/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
    if (!res.ok || !res.body) throw new Error(`API ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const handleFrame = (frame: string) => {
      let event = "";
      let dataLine = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLine = line.slice(5).trim();
      }
      if (!dataLine) return;
      const data = JSON.parse(dataLine);
      if (event === "trace") h.onStep(data as TraceStep);
      else if (event === "error") h.onError(data?.error || "valuation failed");
      else if (event === "result") {
        if (data.ok === false) h.onError(data.error || "valuation failed");
        else h.onResult(data as ValuationResult, false);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) handleFrame(frame);
    }
    // flush the final frame (last event may arrive without a trailing blank line)
    if (buffer.trim()) handleFrame(buffer);
  } catch (err: any) {
    if (err?.name === "AbortError") return;
    // graceful demo fallback with a staged trace
    await runDemo(input, h);
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
    const res = await fetch(`${API}/`, { cache: "no-store" });
    const j = await res.json();
    return { online: true, llm: !!j.llm_provider_configured, cv: !!j.cv_service_configured };
  } catch {
    return { online: false, llm: false, cv: false };
  }
}
