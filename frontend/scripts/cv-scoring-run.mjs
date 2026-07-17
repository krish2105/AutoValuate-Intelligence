/**
 * Runs the REAL browser scorer (cv-browser.conditionFromDetections) on the scoring fixtures and
 * prints {case: {score, worst_severity, findings}} as JSON. Invoked by eval/cv_scoring.py, which
 * runs the same fixtures through the backend scorer and asserts the two agree + land in-band.
 * Run from frontend/:  node scripts/cv-scoring-run.mjs <fixtures.json>
 */
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fixtures = JSON.parse(readFileSync(process.argv[2], "utf8")).cases;
const out = join(tmpdir(), `_cvb_score_${process.pid}.mjs`);
await build({
  entryPoints: ["lib/cv-browser.ts"], outfile: out, bundle: true, format: "esm",
  platform: "node", external: ["onnxruntime-web", "onnxruntime-web/wasm"], logLevel: "error",
});
const { conditionFromDetections } = await import(pathToFileURL(out).href);

const binding = { photoSetHash: "0".repeat(64), photosAssessed: 1, status: "complete" };
const result = {};
for (const [name, dets] of Object.entries(fixtures)) {
  const cc = conditionFromDetections([dets.map((d) => ({ ...d, box: [...d.box] }))], binding);
  result[name] = {
    score: cc.condition_score,
    worst_severity: cc.findings.reduce(
      (w, f) => (["minor", "moderate", "severe"].indexOf(f.severity) > ["minor", "moderate", "severe"].indexOf(w) ? f.severity : w),
      "minor"),
    findings: cc.findings.map((f) => ({ t: f.damage_type, sev: f.severity, imp: f.value_impact_pct })),
  };
}
process.stdout.write(JSON.stringify(result));
