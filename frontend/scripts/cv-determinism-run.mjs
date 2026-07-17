/**
 * Runnable proof that in-browser preprocessing is DETERMINISTIC (the fix for "the same photo
 * scores differently each scan"). The old path downscaled with ctx.drawImage + imageSmoothing
 * "high", which is GPU-accelerated and not bit-stable, so the 640² tensor — and the count of
 * borderline detections — drifted between scans. The new path (lib/cv-browser.preprocess /
 * cropSeverity) is a pure area-average over a fixed pixel buffer, so identical pixels MUST give
 * a byte-identical tensor every time. This asserts exactly that, and (as a sanity check) that
 * changing a single pixel DOES change the output — i.e. it really reads the image.
 *
 * Run from frontend/:  node scripts/cv-determinism-run.mjs
 */
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(tmpdir(), `_cvb_det_${process.pid}.mjs`);
await build({
  entryPoints: ["lib/cv-browser.ts"], outfile: out, bundle: true, format: "esm",
  platform: "node", external: ["onnxruntime-web", "onnxruntime-web/wasm"], logLevel: "error",
});
const { preprocess, cropSeverity } = await import(pathToFileURL(out).href);

// A synthetic 400×300 image with structure (not flat) so the resize actually has work to do.
// Deterministic content (no RNG) so the test itself is reproducible.
const W = 400, H = 300;
function makeRaster() {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      data[i] = (x * 7 + y * 3) & 255;                 // R gradient
      data[i + 1] = (x * x + y) & 255;                 // G
      data[i + 2] = ((x ^ y) * 5) & 255;               // B — high-frequency, worst case for a resampler
      data[i + 3] = 255;
    }
  }
  return { data, width: W, height: H };
}

const eqF32 = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
let failed = 0;
const check = (name, ok) => { console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}`); if (!ok) failed++; };

const region = { sx: 0, sy: 0, sw: W, sh: H };

// 1) Same pixels → identical tensor, across many independent calls (the core determinism claim).
const base = preprocess(makeRaster(), region).data;
let allSame = true;
for (let k = 0; k < 25; k++) {
  if (!eqF32(preprocess(makeRaster(), region).data, base)) { allSame = false; break; }
}
check("preprocess() is byte-identical across 25 runs on the same pixels", allSame);

// 2) A tile crop (fractional region, the real code path) is also stable.
const crop = { sx: 0.4 * W, sy: 0.4 * H, sw: 0.6 * W, sh: 0.6 * H };
check("preprocess() is stable for a fractional tile region",
  eqF32(preprocess(makeRaster(), crop).data, preprocess(makeRaster(), crop).data));

// 3) cropSeverity() is stable for the same box.
const box = [0.1, 0.1, 0.7, 0.6];
const s1 = cropSeverity(makeRaster(), box, "dent");
const s2 = cropSeverity(makeRaster(), box, "dent");
check("cropSeverity() returns the identical severity for the same crop", s1 === s2);

// 4) Sanity: it actually reads the pixels — flip one pixel, the tensor must differ.
const r = makeRaster(); r.data[0] = r.data[0] ^ 255;
check("changing one pixel DOES change the tensor (it isn't ignoring the image)",
  !eqF32(preprocess(r, region).data, base));

console.log(failed ? `\n${failed} determinism check(s) FAILED` : "\nall determinism checks passed");
process.exit(failed ? 1 : 0);
