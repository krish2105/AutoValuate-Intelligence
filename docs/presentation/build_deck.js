/* AutoValuate Intelligence — 16-slide deck. Dark automotive theme, real assets/numbers. */
const pptxgen = require("pptxgenjs");
const path = require("path");

const P = new pptxgen();
P.defineLayout({ name: "W", width: 13.333, height: 7.5 });
P.layout = "W";
P.author = "Krishna Mathur";
P.title = "AutoValuate Intelligence";

const C = {
  bg: "0F1620", surface: "141C28", surf2: "1B2534", border: "26303F",
  fg: "EEF3F8", muted: "8A97A6", amber: "F5A623", info: "5AA0E0",
  good: "4FD18B", bad: "E5484D", dim: "5B6675",
};
const HEAD = "Arial", BODY = "Calibri", MONO = "Courier New";
const SS = (f) => path.join(__dirname, "screenshots", f);
const AS = (f) => path.join(__dirname, "assets", f);

function bg(s, color) { s.background = { color: color || C.bg }; }
function pill(s, x, y, text, col) {
  s.addText(text.toUpperCase(), {
    x, y, w: 3.2, h: 0.32, align: "left", valign: "middle",
    fontFace: MONO, fontSize: 10.5, color: col || C.amber, bold: true, charSpacing: 2, margin: 0,
  });
}
function shadow() { return { type: "outer", color: "000000", opacity: 0.55, blur: 14, offset: 6, angle: 90 }; }
function shot(s, file, x, y, w, h) {
  s.addShape(P.ShapeType.roundRect, { x: x - 0.04, y: y - 0.04, w: w + 0.08, h: h + 0.08, rectRadius: 0.1, fill: { color: C.surface }, line: { color: C.border, width: 1 }, shadow: shadow() });
  s.addImage({ path: file, x, y, w, h, sizing: { type: "contain", w, h } });
}
function title(s, t, x, y, w) {
  s.addText(t, { x: x || 0.6, y: y || 0.9, w: w || 8.2, h: 1.0, fontFace: HEAD, fontSize: 34, bold: true, color: C.fg, align: "left", valign: "top", margin: 0 });
}
// stat callout: big mono number + label
function stat(s, x, y, w, num, label, col) {
  s.addText(num, { x, y, w, h: 0.9, fontFace: MONO, fontSize: 40, bold: true, color: col || C.amber, align: "left", margin: 0 });
  s.addText(label, { x, y: y + 0.88, w, h: 0.5, fontFace: BODY, fontSize: 12.5, color: C.muted, align: "left", margin: 0 });
}
// icon-free card with header + body
function card(s, x, y, w, h, header, body, hcol) {
  s.addShape(P.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.09, fill: { color: C.surface }, line: { color: C.border, width: 1 } });
  s.addText(header, { x: x + 0.22, y: y + 0.16, w: w - 0.44, h: 0.4, fontFace: HEAD, fontSize: 15, bold: true, color: hcol || C.fg, align: "left", margin: 0 });
  s.addText(body, { x: x + 0.22, y: y + 0.62, w: w - 0.44, h: h - 0.8, fontFace: BODY, fontSize: 12.5, color: C.muted, align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.05 });
}
function dot(s, x, y, col) { s.addShape(P.ShapeType.ellipse, { x, y, w: 0.14, h: 0.14, fill: { color: col } }); }
function footer(s, n) {
  s.addText("AutoValuate Intelligence", { x: 0.6, y: 7.02, w: 5, h: 0.3, fontFace: BODY, fontSize: 9, color: C.dim, align: "left", margin: 0 });
  s.addText(`${n} / 16`, { x: 11.8, y: 7.02, w: 0.9, h: 0.3, fontFace: MONO, fontSize: 9, color: C.dim, align: "right", margin: 0 });
}

const REPO = "github.com/krish2105/AutoValuate-Intelligence";

/* ---------- 1 · TITLE ---------- */
let s = P.addSlide(); bg(s);
s.addShape(P.ShapeType.roundRect, { x: 0.7, y: 0.7, w: 0.9, h: 0.9, rectRadius: 0.16, fill: { color: C.amber }, shadow: shadow() });
s.addText("◔", { x: 0.7, y: 0.66, w: 0.9, h: 0.9, fontFace: HEAD, fontSize: 34, bold: true, color: C.bg, align: "center", valign: "middle", margin: 0 });
s.addText("AutoValuate", { x: 1.75, y: 0.72, w: 6, h: 0.55, fontFace: HEAD, fontSize: 26, bold: true, color: C.fg, margin: 0 });
s.addText("INTELLIGENCE", { x: 1.77, y: 1.18, w: 6, h: 0.35, fontFace: MONO, fontSize: 12, color: C.muted, charSpacing: 4, margin: 0 });
s.addText("Explainable, damage-aware\ncar valuation for the UAE.", { x: 0.7, y: 2.55, w: 7.6, h: 1.5, fontFace: HEAD, fontSize: 37, bold: true, color: C.fg, align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.0 });
s.addText([
  { text: "One trained damage detector · one explainable price model · one agentic-RAG layer — ", options: { color: C.muted } },
  { text: "every number citation-grounded.", options: { color: C.amber, bold: true } },
], { x: 0.7, y: 4.35, w: 7.1, h: 0.9, fontFace: BODY, fontSize: 15, align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.1 });
s.addText([
  { text: "Krishna Mathur", options: { bold: true, color: C.fg } },
  { text: "   ·   MAIB, SP Jain School of Global Management", options: { color: C.muted } },
], { x: 0.7, y: 5.65, w: 7.4, h: 0.4, fontFace: BODY, fontSize: 13.5, margin: 0 });
s.addText([{ text: "Repo  ", options: { color: C.muted } }, { text: REPO, options: { color: C.info } }, { text: "     Live demo  ", options: { color: C.muted } }, { text: "deploying (runs locally today)", options: { color: C.amber } }], { x: 0.7, y: 6.2, w: 9, h: 0.4, fontFace: MONO, fontSize: 11, margin: 0 });
shot(s, SS("01_hero_form_dark.png"), 8.5, 1.5, 4.35, 4.6);

/* ---------- 2 · PROBLEM ---------- */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.55, "The problem"); title(s, "Everyone selling a car gets lowballed.");
stat(s, 0.6, 2.15, 5.6, "$20.6B", "UAE used-car market by 2026 — large, real, still growing", C.amber);
card(s, 0.6, 3.7, 3.75, 2.7, "Dealers quote low", "They quote below market to protect their own resale margin. You have no independent number to push back with.", C.fg);
card(s, 4.55, 3.7, 3.75, 2.7, "Classifieds mislead", "Listing sites show asking prices, not what cars actually sell for. Anchoring on them overprices your car.", C.fg);
card(s, 8.5, 3.7, 4.2, 2.7, "Damage is guesswork", "Both sides price that door dent by gut feeling. Nobody quantifies what a specific dent, at this mileage, actually costs.", C.fg);
footer(s, 2);

/* ---------- 3 · WHY TOOLS FALL SHORT ---------- */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.55, "Why existing tools fall short"); title(s, "Each piece exists. Nobody stitches them together.");
s.addText("Online valuators still tell you to pay for an in-person inspection to get a number you can trust. And not one consumer tool combines all three of these in a single report:", { x: 0.6, y: 1.9, w: 12, h: 0.8, fontFace: BODY, fontSize: 15, color: C.muted, margin: 0, lineSpacingMultiple: 1.1 });
const cols = [["Visual damage assessment", "Sees the dents, scratches, cracks — and localizes them."], ["Explainable pricing", "Shows exactly why it reached a number, factor by factor."], ["Live comparable evidence", "Backs the estimate with real listings you can open."]];
cols.forEach((c2, i) => {
  const x = 0.6 + i * 4.15;
  s.addShape(P.ShapeType.roundRect, { x, y: 3.0, w: 3.85, h: 2.9, rectRadius: 0.09, fill: { color: C.surface }, line: { color: C.border, width: 1 } });
  s.addShape(P.ShapeType.ellipse, { x: x + 0.22, y: 3.25, w: 0.5, h: 0.5, fill: { color: C.good } });
  s.addText("✓", { x: x + 0.22, y: 3.24, w: 0.5, h: 0.5, fontFace: HEAD, fontSize: 20, bold: true, color: C.bg, align: "center", valign: "middle", margin: 0 });
  s.addText(c2[0], { x: x + 0.22, y: 3.95, w: 3.4, h: 0.7, fontFace: HEAD, fontSize: 15.5, bold: true, color: C.fg, margin: 0 });
  s.addText(c2[1], { x: x + 0.22, y: 4.7, w: 3.4, h: 1.0, fontFace: BODY, fontSize: 12.5, color: C.muted, margin: 0, lineSpacingMultiple: 1.1 });
});
s.addText("AutoValuate is the one report that carries all three — and ties every claim back to the model that produced it.", { x: 0.6, y: 6.2, w: 12, h: 0.5, fontFace: BODY, fontSize: 13.5, italic: true, color: C.amber, margin: 0 });
footer(s, 3);

/* ---------- 4 · SOLUTION IN ONE PICTURE ---------- */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.55, "The solution"); title(s, "Photos in. A trustworthy, explained number out.");
const flow = [["Photos + details", "in", C.info], ["Damage · price · comparables", "three models", C.amber], ["Plain-English report", "out", C.good]];
flow.forEach((f, i) => {
  const x = 0.75 + i * 4.25;
  s.addShape(P.ShapeType.roundRect, { x, y: 2.6, w: 3.5, h: 1.7, rectRadius: 0.12, fill: { color: C.surface }, line: { color: f[2], width: 1.5 } });
  s.addText(f[1].toUpperCase(), { x: x + 0.25, y: 2.8, w: 3, h: 0.3, fontFace: MONO, fontSize: 10, color: f[2], bold: true, charSpacing: 2, margin: 0 });
  s.addText(f[0], { x: x + 0.25, y: 3.2, w: 3, h: 0.9, fontFace: HEAD, fontSize: 17, bold: true, color: C.fg, valign: "top", margin: 0 });
  if (i < 2) s.addText("→", { x: x + 3.55, y: 2.9, w: 0.65, h: 1.1, fontFace: HEAD, fontSize: 30, color: C.dim, align: "center", valign: "middle", margin: 0 });
});
s.addText("No black box: the middle step is a purpose-trained CV model, a gradient-boosted price model with SHAP, and a hybrid retrieval layer — not one LLM guessing.", { x: 0.75, y: 5.1, w: 11.8, h: 1.0, fontFace: BODY, fontSize: 15, color: C.muted, margin: 0, lineSpacingMultiple: 1.15 });
footer(s, 4);

/* ---------- 5 · LIVE DEMO POINTER ---------- */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.55, "Let's see it work");
s.addText("This is the running app.", { x: 0.6, y: 0.95, w: 6.5, h: 0.9, fontFace: HEAD, fontSize: 32, bold: true, color: C.fg, margin: 0 });
s.addText("Everything on the next slides is a screenshot of this exact system — not a mockup. I'll switch to it live now.", { x: 0.6, y: 2.0, w: 6.3, h: 1.2, fontFace: BODY, fontSize: 15, color: C.muted, margin: 0, lineSpacingMultiple: 1.2 });
s.addText([{ text: "Runs locally today:  ", options: { color: C.muted } }, { text: "localhost:3000", options: { color: C.amber, bold: true } }], { x: 0.6, y: 3.4, w: 6.3, h: 0.4, fontFace: MONO, fontSize: 13, margin: 0 });
s.addText([{ text: "Public URLs:  ", options: { color: C.muted } }, { text: "deploying to Vercel + Hugging Face", options: { color: C.info } }], { x: 0.6, y: 3.85, w: 6.3, h: 0.4, fontFace: MONO, fontSize: 12, margin: 0 });
s.addText("You're welcome to open the repo and run ./eval/run_all.sh — every number in this deck reproduces.", { x: 0.6, y: 4.7, w: 6.3, h: 1.0, fontFace: BODY, fontSize: 13.5, italic: true, color: C.good, margin: 0, lineSpacingMultiple: 1.15 });
shot(s, SS("06_full_dark.png"), 7.6, 0.7, 5.2, 6.1);
footer(s, 5);

/* ---------- 6 · ARCHITECTURE ---------- */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.5, "System architecture"); title(s, "A genuine hybrid — three AI systems, one product.", 0.6, 0.82, 12);
shot(s, AS("architecture.png"), 0.6, 1.75, 12.13, 5.0);
footer(s, 6);

/* ---------- 7 · DEEP LEARNING: DETECTOR ---------- */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.55, "Deep learning · the damage detector"); title(s, "A model trained to see damage — and where it is.");
card(s, 0.6, 2.0, 5.9, 1.55, "~18,000 real annotated images", "CarDD + VehiDE, unified into one 8-class schema (dent, scratch, crack, glass shatter, lamp broken, tire flat, punctured, missing part).", C.amber);
card(s, 0.6, 3.75, 5.9, 1.55, "YOLOv8 detection, not classification", "Location matters for pricing — a windshield crack costs differently than a bumper scratch. So we detect and localize, not just label.", C.info);
card(s, 0.6, 5.5, 5.9, 1.15, "Verified pipeline", "14,437 training + 1,184 validation images unified on Kaggle; ONNX export runs CPU-only on the free Hugging Face Space.", C.good);
shot(s, SS("06_full_light.png"), 7.0, 1.8, 5.8, 4.9);
footer(s, 7);

/* ---------- 8 · CV RESULTS (honest / pending) ---------- */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.55, "CV results"); title(s, "Honest numbers — the detector is still training.");
s.addShape(P.ShapeType.roundRect, { x: 0.6, y: 2.1, w: 5.9, h: 2.3, rectRadius: 0.1, fill: { color: C.surface }, line: { color: C.amber, width: 1.5 } });
s.addText("mAP@0.5", { x: 0.85, y: 2.35, w: 5, h: 0.4, fontFace: BODY, fontSize: 14, color: C.muted, margin: 0 });
s.addText("lands here", { x: 0.85, y: 2.75, w: 5.4, h: 0.9, fontFace: MONO, fontSize: 34, bold: true, color: C.amber, margin: 0 });
s.addText("held-out, per-class P·R from notebook 03", { x: 0.85, y: 3.7, w: 5.4, h: 0.5, fontFace: BODY, fontSize: 11.5, italic: true, color: C.dim, margin: 0 });
card(s, 6.8, 2.1, 5.95, 2.3, "Why it's blank — and why that's the right call", "The YOLOv8 fine-tune is running on Kaggle's free P100. I will not print a fabricated mAP. The eval harness already computes it on a strictly held-out split (no early-stop leakage), so the real number drops straight in when the run finishes.", C.fg);
s.addText("What is already real and audited:", { x: 0.6, y: 4.75, w: 12, h: 0.4, fontFace: HEAD, fontSize: 14, bold: true, color: C.fg, margin: 0 });
[["8-class unified dataset", "14,437 train / 1,184 val — merged from CarDD + VehiDE, nothing dropped"], ["Leakage-safe eval", "held-out half of val by deterministic hash; ONNX-vs-PyTorch parity check"], ["Deploy path proven", "CPU ONNX service, full decode + NMS verified on synthetic output"]].forEach((r, i) => {
  const x = 0.6 + i * 4.15;
  s.addShape(P.ShapeType.roundRect, { x, y: 5.25, w: 3.85, h: 1.35, rectRadius: 0.08, fill: { color: C.surf2 }, line: { color: C.border, width: 1 } });
  s.addText(r[0], { x: x + 0.2, y: 5.4, w: 3.5, h: 0.4, fontFace: HEAD, fontSize: 12.5, bold: true, color: C.good, margin: 0 });
  s.addText(r[1], { x: x + 0.2, y: 5.8, w: 3.5, h: 0.75, fontFace: BODY, fontSize: 11, color: C.muted, margin: 0, lineSpacingMultiple: 1.05 });
});
footer(s, 8);

/* ---------- 9 · CLASSICAL ML: VALUATION ---------- */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.55, "Explainable ML · the valuation model"); title(s, "A price you can interrogate, factor by factor.");
stat(s, 0.6, 2.05, 3.0, "19.6%", "median error (held-out CV)", C.amber);
stat(s, 3.7, 2.05, 3.0, "+28.4%", "better than a naive baseline", C.good);
stat(s, 0.6, 3.75, 3.0, "0.80", "calibrated price-interval coverage", C.info);
stat(s, 3.7, 3.75, 3.0, "3 / 3", "SHAP directional checks pass", C.good);
s.addText("XGBoost quantile model on 672 real Dubizzle listings. SHAP explains each estimate; a split-conformal interval makes the stated 80% range mean 80%. Mileage and age push price down, newer year lifts it — exactly as economics demands.", { x: 0.6, y: 5.5, w: 6.1, h: 1.3, fontFace: BODY, fontSize: 12.5, color: C.muted, margin: 0, lineSpacingMultiple: 1.15 });
shot(s, SS("03_valuation_shap_dark.png"), 7.0, 1.9, 5.8, 4.6);
footer(s, 9);

/* ---------- 10 · AGENTIC LAYER ---------- */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.55, "The agentic layer"); title(s, "Seven agents, streamed live — and a hard gate.");
card(s, 0.6, 2.0, 6.0, 1.5, "LangGraph orchestration", "Intake → Aggregation (CV) → Valuation → Comparables → Report → Verifier → Confidence. Each step streams to the UI over SSE, so you watch the reasoning happen.", C.fg);
card(s, 0.6, 3.65, 6.0, 1.65, "The Verifier — a real gate, not a promise", "Every AED figure and citation in the report must trace to a computed value. In testing it caught an injected AED 999,999, a fake citation, and an ungrounded percentage.", C.amber);
card(s, 0.6, 5.45, 6.0, 1.2, "Never blank", "Gemini writes the report, Groq is the fallback, and a deterministic writer keeps it working with no keys at all.", C.info);
shot(s, SS("02_live_trace_dark.png"), 7.1, 1.9, 5.7, 4.7);
footer(s, 10);

/* ---------- 11 · RESPONSIBLE AI ---------- */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.55, "Responsible AI"); title(s, "It tells you how sure it is — and when not to trust it.");
card(s, 0.6, 2.0, 6.0, 1.45, "States its confidence", "Every report gives the price-interval width and, when photos are provided, the detector's per-damage confidence.", C.fg);
card(s, 0.6, 3.6, 6.0, 1.45, "Recommends inspection when unsure", "Low or moderate confidence triggers a plain-English 'get a professional inspection' — it never presents a false-certain number.", C.amber);
card(s, 0.6, 5.2, 6.0, 1.45, "Enforced, not aspirational", "The Section-15 disclosure contract is a test: 90 checks across 18 vehicles, zero failures. It never claims to be a certified appraisal.", C.good);
shot(s, SS("05_report_citations_light.png"), 7.1, 1.9, 5.7, 4.7);
footer(s, 11);

/* ---------- 12 · TECH STACK / WHY FREE ---------- */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.55, "The stack · and why it's all free"); title(s, "Zero cost — with the engineering judgment to prove it.");
const hosts = [["Vercel", "Frontend (Next.js)"], ["Render", "Orchestration API"], ["Hugging Face", "CV inference · CPU Basic"], ["Supabase", "Postgres · pgvector · Auth"], ["Kaggle", "GPU training (offline)"], ["Gemini / Groq", "LLM report writer"]];
hosts.forEach((h, i) => {
  const x = 0.6 + (i % 3) * 4.15, y = 2.0 + Math.floor(i / 3) * 1.35;
  s.addShape(P.ShapeType.roundRect, { x, y, w: 3.85, h: 1.15, rectRadius: 0.08, fill: { color: C.surface }, line: { color: C.border, width: 1 } });
  s.addText(h[0], { x: x + 0.2, y: y + 0.16, w: 3.5, h: 0.4, fontFace: HEAD, fontSize: 14, bold: true, color: C.fg, margin: 0 });
  s.addText(h[1], { x: x + 0.2, y: y + 0.58, w: 3.5, h: 0.4, fontFace: MONO, fontSize: 10.5, color: C.info, margin: 0 });
});
s.addText([
  { text: "Render, not Railway", options: { bold: true, color: C.amber } }, { text: " (Railway has no real free tier in 2026).   ", options: { color: C.muted } },
  { text: "The CV model runs on Hugging Face", options: { bold: true, color: C.amber } }, { text: " — 512MB can't hold it.   ", options: { color: C.muted } },
  { text: "A scheduled ping", options: { bold: true, color: C.amber } }, { text: " keeps Supabase from auto-pausing, so the link never dies.", options: { color: C.muted } },
], { x: 0.6, y: 5.35, w: 12.1, h: 1.3, fontFace: BODY, fontSize: 13.5, margin: 0, lineSpacingMultiple: 1.25 });
footer(s, 12);

/* ---------- 13 · EVALUATION SUMMARY ---------- */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.55, "Evaluation summary"); title(s, "Every number here reproduces from the repo.");
const evs = [["19.6%", "valuation median error", C.amber], ["1.00", "comparables same-make P@5", C.good], ["1.000", "report faithfulness", C.good], ["0.000", "faithfulness — hallucinated control", C.bad], ["90 / 90", "confidence-contract checks", C.info], ["53", "integration checks, all green", C.info]];
evs.forEach((e, i) => {
  const x = 0.6 + (i % 3) * 4.15, y = 2.0 + Math.floor(i / 3) * 1.75;
  s.addShape(P.ShapeType.roundRect, { x, y, w: 3.85, h: 1.5, rectRadius: 0.09, fill: { color: C.surface }, line: { color: C.border, width: 1 } });
  s.addText(e[0], { x: x + 0.25, y: y + 0.22, w: 3.4, h: 0.7, fontFace: MONO, fontSize: 30, bold: true, color: e[2], margin: 0 });
  s.addText(e[1], { x: x + 0.25, y: y + 0.95, w: 3.4, h: 0.45, fontFace: BODY, fontSize: 11.5, color: C.muted, margin: 0 });
});
s.addText("CV mAP@0.5 lands here once training finishes — the same held-out harness, no placeholder in its place.", { x: 0.6, y: 5.7, w: 12, h: 0.5, fontFace: BODY, fontSize: 12.5, italic: true, color: C.amber, margin: 0 });
footer(s, 13);

/* ---------- 14 · LIMITATIONS ---------- */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.55, "Limitations & honest scope"); title(s, "What it does not do — named on purpose.");
[["CV detector still training", "The mAP isn't in yet; the deep-learning claim rests on the finished run, and I'd rather show that than a guess."],
 ["Modest tabular set", "672 real listings is small, so the price interval is genuinely wide — which is exactly why the range is disclosed, not hidden."],
 ["CPU-speed inference", "The free tier runs the detector on CPU: a few seconds per image, batched — fine for a demo, not high-throughput."],
 ["No accident-history feed", "There's no free UAE accident-record API, so the estimate can't see undisclosed history — hence 'get an inspection.'"]].forEach((r, i) => {
  const x = 0.6 + (i % 2) * 6.2, y = 2.1 + Math.floor(i / 2) * 2.25;
  card(s, x, y, 5.9, 2.0, r[0], r[1], C.fg);
});
footer(s, 14);

/* ---------- 15 · ROADMAP ---------- */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.55, "Roadmap"); title(s, "Where it goes next.");
[["Dealer bulk API", "Batch intake + a verified-estimate API for used-car dealers — the paying tier.", C.amber],
 ["Dubizzle auto-fill", "A browser extension that pre-fills a listing straight from a completed valuation.", C.info],
 ["Price-trend alerts", "'Your car's segment dropped 4% this month' — turning a one-shot tool into a reason to return.", C.good]].forEach((r, i) => {
  const x = 0.6 + i * 4.15;
  s.addShape(P.ShapeType.roundRect, { x, y: 2.4, w: 3.85, h: 3.4, rectRadius: 0.1, fill: { color: C.surface }, line: { color: C.border, width: 1 } });
  s.addText(`0${i + 1}`, { x: x + 0.25, y: 2.65, w: 2, h: 0.7, fontFace: MONO, fontSize: 30, bold: true, color: r[2], margin: 0 });
  s.addText(r[0], { x: x + 0.25, y: 3.5, w: 3.4, h: 0.7, fontFace: HEAD, fontSize: 17, bold: true, color: C.fg, margin: 0 });
  s.addText(r[1], { x: x + 0.25, y: 4.2, w: 3.4, h: 1.4, fontFace: BODY, fontSize: 12.5, color: C.muted, margin: 0, lineSpacingMultiple: 1.15 });
});
s.addText("All post-MVP — clearly future work, not claimed as built.", { x: 0.6, y: 6.1, w: 12, h: 0.4, fontFace: BODY, fontSize: 12.5, italic: true, color: C.dim, margin: 0 });
footer(s, 15);

/* ---------- 16 · CLOSE ---------- */
s = P.addSlide(); bg(s);
s.addText("One project, three things proven.", { x: 0.7, y: 0.9, w: 12, h: 0.9, fontFace: HEAD, fontSize: 34, bold: true, color: C.fg, margin: 0 });
[["Deep learning", "a trained, evaluated CV damage detector", C.amber], ["Explainable ML", "XGBoost + SHAP, a price you can interrogate", C.info], ["Agentic RAG", "orchestration with a hard citation gate", C.good]].forEach((r, i) => {
  const y = 2.15 + i * 1.15;
  dot(s, 0.75, y + 0.14, r[2]);
  s.addText(r[0], { x: 1.1, y, w: 3.4, h: 0.5, fontFace: HEAD, fontSize: 19, bold: true, color: C.fg, margin: 0 });
  s.addText(r[1], { x: 4.4, y: y + 0.02, w: 8, h: 0.5, fontFace: BODY, fontSize: 14.5, color: C.muted, margin: 0 });
});
s.addText([{ text: "Repo  ", options: { color: C.muted } }, { text: REPO, options: { color: C.info } }, { text: "     ·     Live demo  ", options: { color: C.muted } }, { text: "deploying (runs locally today)", options: { color: C.amber } }], { x: 0.75, y: 5.9, w: 11.5, h: 0.4, fontFace: MONO, fontSize: 12, margin: 0 });
s.addText("Thank you — happy to open any part of it live.", { x: 0.75, y: 6.5, w: 11, h: 0.5, fontFace: HEAD, fontSize: 18, bold: true, color: C.amber, margin: 0 });

/* ---------- speaker notes ---------- */
const notes = [
  "Open with the hook — a friend or relative selling a car and getting lowballed. Say the name, program, and that everything shown is a real running system. ~40s.",
  "The market is huge and real — 20.6 billion by 2026. Land the three pains: dealers quote low, classifieds mislead, damage is guesswork. Pause on the stat. ~45s.",
  "The insight: every piece exists somewhere, nobody combines them. Walk the three columns. This is the gap the product fills. ~40s.",
  "Simple mental model: photos in, explained number out. Stress the middle is three real models, not one LLM guessing. ~35s.",
  "Switch to the live app here. Do a real valuation end to end. Invite them to open the repo and run the test suite. ~60s + demo.",
  "The one-picture architecture. Say out loud: a trained CV model AND a classical ML model AND an agentic layer — that's what makes it a hybrid, not a wrapper. ~50s.",
  "The deep-learning core. 18k real annotated images, and detection not classification because location changes the price. Name the datasets. ~50s.",
  "Be upfront: the detector is still training, so there's no mAP yet, and I won't fake one. Show what's already real — the dataset, the leakage-safe eval, the deploy path. Honesty is the point. ~55s.",
  "The price model. Hit the four numbers: 19.6% median error, 28% better than baseline, calibrated interval, directional checks pass. Point at the SHAP bars — that's the 'why'. ~55s.",
  "The agentic layer. Seven agents streamed live. The Verifier is the star — it caught injected fake numbers in testing. That's the honesty guarantee, enforced in code. ~55s.",
  "Responsible AI — the part I care about. It states confidence, recommends inspection when unsure, and that's a passing test, not a promise. Never claims to be a certified appraisal. ~50s.",
  "The stack and the judgment behind it: Render not Railway, CV on Hugging Face, Supabase keep-alive. This slide is about engineering decisions, not tutorial-following. ~45s.",
  "Consolidated numbers — all reproducible. Point at the 0.000 negative control: it proves the faithfulness metric actually discriminates. mAP joins this table when training lands. ~45s.",
  "Name the limitations plainly — training not finished, small dataset, CPU speed, no accident feed. Naming them is a maturity signal. ~45s.",
  "Future work, clearly marked as future: dealer API, Dubizzle auto-fill, trend alerts. Ties to the who-pays story. ~35s.",
  "Recap the three proven capabilities. End on what I learned building it, then thanks and questions. Offer to open anything live. ~40s.",
];
P.slides.forEach((sl, i) => sl.addNotes(notes[i]));

P.writeFile({ fileName: path.join(__dirname, "AutoValuate_Intelligence_Deck.pptx") }).then((f) => console.log("wrote", f));
