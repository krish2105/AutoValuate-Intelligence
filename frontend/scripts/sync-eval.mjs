/**
 * Refresh the committed eval snapshots the /model report card renders from
 * (frontend/lib/eval/*.json) from the repo's ../eval outputs. Run locally after a new
 * eval run: `node scripts/sync-eval.mjs`.
 *
 * NOT wired into predev/prebuild — Vercel builds from the frontend/ root where ../eval
 * doesn't exist, so the committed snapshot is the source of truth for the deployed app.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "eval");
const dst = join(here, "..", "lib", "eval");

const FILES = [
  "valuation_metrics.json", "cv_eval_report.json", "cv_train_summary.json",
  "faithfulness_report.json", "comparables_eval.json", "guardrails_report.json", "shap_report.json",
];

if (!existsSync(src)) {
  console.warn(`[sync-eval] ../eval not found (${src}) — using committed snapshot. Skipping.`);
  process.exit(0);
}
mkdirSync(dst, { recursive: true });
let n = 0;
for (const f of FILES) {
  const from = join(src, f);
  if (existsSync(from)) { copyFileSync(from, join(dst, f)); n++; }
}
console.log(`[sync-eval] refreshed ${n} eval snapshot(s) → lib/eval/`);
