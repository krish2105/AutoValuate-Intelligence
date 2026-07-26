import { test, expect } from "@playwright/test";
import {
  judge, framing, nms, blurAndLuminance, THRESHOLDS,
  type Box, type CaptureSignals,
} from "../lib/cv/capture-quality";

/**
 * Pure unit tests for capture coaching — no page, no model, so they run in the existing
 * Playwright CI (same pattern as deal-score / financing).
 *
 * The numbers below are the ones MEASURED during calibration on a real whole-car photo, not
 * invented: sharp blur 4218, slight blur 316, heavy blur 13; luminance 107 normal, 18.8 dark,
 * 230 blown; detector fill 78% framed / 102%+cut-off cropped in / 9.6% stood back.
 */

const sig = (o: Partial<CaptureSignals> = {}): CaptureSignals => ({
  vehicleFound: true, confidence: 0.88, fillRatio: 0.78, cutOff: false,
  vehicleCount: 1, blur: 4218, luminance: 107, ...o,
});

const box = (x1: number, y1: number, x2: number, y2: number, score = 0.9): Box =>
  ({ x1, y1, x2, y2, score });

test("a well-framed sharp photo raises nothing", () => {
  const a = judge(sig());
  expect(a.ok).toBe(true);
  expect(a.issues).toEqual([]);
  expect(a.message).toBeNull();
});

test("the measured degradations each produce their own verdict", () => {
  expect(judge(sig({ fillRatio: 0.096 })).primary).toBe("too_far");
  expect(judge(sig({ cutOff: true, fillRatio: 1.0 })).primary).toBe("cut_off");
  expect(judge(sig({ blur: 13 })).primary).toBe("blurry");
  expect(judge(sig({ luminance: 18.8 })).primary).toBe("too_dark");
  expect(judge(sig({ luminance: 230 })).primary).toBe("overexposed");
  expect(judge(sig({ vehicleFound: false })).primary).toBe("no_vehicle");
});

test("a slightly soft photo is still acceptable — we must not nag on usable shots", () => {
  // Measured 316 for a 9px gaussian: visibly soft but the detector still reads it fine.
  expect(judge(sig({ blur: 316 })).ok).toBe(true);
});

test("a dark photo is reported as dark, never as blurry", () => {
  // Under-exposure also collapses Laplacian variance (measured: 30 on the very-dark copy), so
  // a naive ordering would send the user to fix focus when the real problem is light.
  const a = judge(sig({ luminance: 8.1, blur: 30 }));
  expect(a.primary).toBe("too_dark");
  expect(a.issues).not.toContain("blurry");
});

test("cut-off wins over too-close — it is the actionable instruction", () => {
  const a = judge(sig({ cutOff: true, fillRatio: 0.99 }));
  expect(a.primary).toBe("cut_off");
  expect(a.issues).not.toContain("too_close");
});

test("every issue carries a message the user can act on", () => {
  for (const s of [
    sig({ vehicleFound: false }), sig({ fillRatio: 0.05 }), sig({ cutOff: true }),
    sig({ blur: 5 }), sig({ luminance: 10 }), sig({ luminance: 250 }),
    sig({ vehicleCount: 3 }),
  ]) {
    const a = judge(s);
    expect(a.ok).toBe(false);
    expect(a.message).toBeTruthy();
    expect(a.message!.length).toBeGreaterThan(10);
  }
});

test("NMS collapses the duplicate boxes the raw head emits for one car", () => {
  // Measured: ~11 raw boxes for a single car. Without NMS "multiple_vehicles" fires always.
  const dupes = Array.from({ length: 11 }, (_, i) =>
    box(100 + i, 100 + i, 400 + i, 300 + i, 0.9 - i * 0.01));
  expect(nms(dupes)).toHaveLength(1);
});

test("NMS keeps genuinely separate vehicles", () => {
  expect(nms([box(0, 0, 100, 100), box(500, 500, 700, 700)])).toHaveLength(2);
});

test("fill is clamped to the frame, but cut-off uses the real overflow", () => {
  // A box running well past the edges must not claim >100% coverage...
  const f = framing([box(-200, -200, 1200, 800)], 1000, 600);
  expect(f.fillRatio).toBeLessThanOrEqual(1);
  // ...while still being reported as cut off, which is the actionable part.
  expect(f.cutOff).toBe(true);
});

test("framing picks the largest vehicle, not the most confident", () => {
  // A tiny high-confidence car in the background must not become "the subject".
  const f = framing([box(0, 0, 40, 30, 0.99), box(100, 100, 900, 500, 0.5)], 1000, 600);
  expect(f.fillRatio).toBeGreaterThan(0.4);
  expect(f.confidence).toBe(0.5);
});

test("no boxes degrades to zeroed signals rather than NaN", () => {
  const f = framing([], 1000, 600);
  expect(f).toEqual({ fillRatio: 0, cutOff: false, confidence: 0, count: 0 });
  expect(Number.isFinite(framing([box(0, 0, 10, 10)], 0, 0).fillRatio)).toBe(true);
});

test("blur/luminance: flat grey is unblurred-but-featureless, noise is high-variance", () => {
  const w = 32, h = 32;
  const flat = new Float32Array(w * h).fill(128);
  const r1 = blurAndLuminance(flat, w, h);
  expect(r1.luminance).toBeCloseTo(128, 5);
  expect(r1.blur).toBeCloseTo(0, 5); // no edges at all

  const checker = new Float32Array(w * h);
  for (let i = 0; i < checker.length; i++) checker[i] = (i % 2) * 255;
  expect(blurAndLuminance(checker, w, h).blur).toBeGreaterThan(THRESHOLDS.minBlur);
});

test("thresholds stay ordered — a bad edit here silently breaks the advice", () => {
  expect(THRESHOLDS.minFill).toBeLessThan(THRESHOLDS.maxFill);
  expect(THRESHOLDS.minLuminance).toBeLessThan(THRESHOLDS.maxLuminance);
  expect(THRESHOLDS.minBlur).toBeGreaterThan(0);
  expect(THRESHOLDS.minConfidence).toBeGreaterThan(0);
  expect(THRESHOLDS.minConfidence).toBeLessThan(1);
});
