/**
 * Runs the REAL browser fusion (cv-browser.fuseDetections) on the conformance fixtures and
 * prints {case: detections} as JSON. Invoked by eval/cv_conformance.py, which runs the same
 * fixtures through the backend and asserts the two agree. Run from the frontend/ dir so esbuild
 * and the cv-browser imports resolve. Usage: node scripts/cv-conformance-run.mjs <fixtures.json>
 */
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fixturesPath = process.argv[2];
const fixtures = JSON.parse(readFileSync(fixturesPath, "utf8")).cases;

const out = join(tmpdir(), `_cvb_conf_${process.pid}.mjs`);
await build({
  entryPoints: ["lib/cv-browser.ts"], outfile: out, bundle: true, format: "esm",
  platform: "node", external: ["onnxruntime-web", "onnxruntime-web/wasm"], logLevel: "error",
});
const { fuseDetections } = await import(pathToFileURL(out).href);

const result = {};
for (const [name, dets] of Object.entries(fixtures)) {
  result[name] = fuseDetections(dets.map((d) => ({ ...d, box: [...d.box] })));
}
process.stdout.write(JSON.stringify(result));
