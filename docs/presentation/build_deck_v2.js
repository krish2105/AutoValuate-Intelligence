/* AutoValuate Intelligence — 13-slide C-level deck. Dark automotive theme, live product screenshots, real numbers. */
const pptxgen = require("pptxgenjs");
const path = require("path");

const P = new pptxgen();
P.defineLayout({ name: "W", width: 13.333, height: 7.5 });
P.layout = "W";
P.author = "AutoValuate team — SP Jain";
P.title = "AutoValuate Intelligence";

const C = {
  bg: "0F1620", surface: "141C28", surf2: "1B2534", border: "26303F",
  fg: "EEF3F8", muted: "8A97A6", amber: "F5A623", info: "5AA0E0",
  good: "4FD18B", bad: "E5484D", dim: "5B6675",
};
const HEAD = "Arial", BODY = "Calibri", MONO = "Courier New";
const SH = (f) => path.join(__dirname, "shots", f);

function bg(s, color) { s.background = { color: color || C.bg }; }
function shadow() { return { type: "outer", color: "000000", opacity: 0.5, blur: 12, offset: 5, angle: 90 }; }
function kicker(s, text, x, y) {
  s.addText(text.toUpperCase(), { x: x ?? 0.6, y: y ?? 0.5, w: 9, h: 0.3, fontFace: MONO, fontSize: 11, color: C.amber, bold: true, charSpacing: 2, margin: 0 });
}
function title(s, t, x, y, w, size) {
  s.addText(t, { x: x ?? 0.6, y: y ?? 0.82, w: w ?? 8.4, h: 1.1, fontFace: HEAD, fontSize: size ?? 32, bold: true, color: C.fg, align: "left", valign: "top", margin: 0 });
}
function shot(s, file, x, y, w, h) {
  s.addShape(P.ShapeType.roundRect, { x: x - 0.05, y: y - 0.05, w: w + 0.1, h: h + 0.1, rectRadius: 0.1, fill: { color: C.surface }, line: { color: C.border, width: 1 }, shadow: shadow() });
  s.addImage({ path: file, x, y, w, h, sizing: { type: "contain", w, h } });
}
function card(s, x, y, w, h, header, body, hcol) {
  s.addShape(P.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.09, fill: { color: C.surface }, line: { color: C.border, width: 1 } });
  s.addText(header, { x: x + 0.24, y: y + 0.18, w: w - 0.48, h: 0.42, fontFace: HEAD, fontSize: 15, bold: true, color: hcol || C.fg, align: "left", margin: 0 });
  s.addText(body, { x: x + 0.24, y: y + 0.66, w: w - 0.48, h: h - 0.86, fontFace: BODY, fontSize: 12.5, color: C.muted, align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.06 });
}
function stat(s, x, y, w, num, label, col) {
  s.addText(num, { x, y, w, h: 0.86, fontFace: MONO, fontSize: 34, bold: true, color: col || C.amber, align: "left", margin: 0 });
  s.addText(label, { x, y: y + 0.8, w, h: 0.6, fontFace: BODY, fontSize: 12, color: C.muted, align: "left", margin: 0, lineSpacingMultiple: 1.0 });
}
function footer(s, n) {
  s.addText("AutoValuate Intelligence", { x: 0.6, y: 7.08, w: 6, h: 0.3, fontFace: BODY, fontSize: 9.5, color: C.dim, align: "left", margin: 0 });
  s.addText(`${n} / 13`, { x: 11.8, y: 7.08, w: 0.93, h: 0.3, fontFace: MONO, fontSize: 9.5, color: C.dim, align: "right", margin: 0 });
}
function bullets(s, x, y, w, items, gap) {
  s.addText(items.map((t) => ({ text: t, options: { bullet: { code: "2022", indent: 14 }, color: C.fg, breakLine: true, paraSpaceAfter: gap ?? 8 } })),
    { x, y, w, h: 4.5, fontFace: BODY, fontSize: 14, color: C.fg, align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.05 });
}

/* ── Slide 1 — Title ─────────────────────────────────────────── */
let s = P.addSlide(); bg(s);
s.addShape(P.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.14, fill: { color: C.amber } });
s.addText("AV", { x: 0.6, y: 0.55, w: 1.0, h: 0.8, fontFace: HEAD, fontSize: 30, bold: true, color: C.bg, align: "center", valign: "middle", fill: { color: C.amber }, margin: 0 });
s.addText("AutoValuate", { x: 0.6, y: 2.5, w: 12, h: 1.2, fontFace: HEAD, fontSize: 62, bold: true, color: C.fg, align: "left", margin: 0 });
s.addText("Intelligence", { x: 0.6, y: 3.65, w: 12, h: 1.0, fontFace: HEAD, fontSize: 62, bold: true, color: C.amber, align: "left", margin: 0 });
s.addText("Know what your car is really worth — with the reasoning shown, not hidden.", { x: 0.62, y: 4.8, w: 11, h: 0.6, fontFace: BODY, fontSize: 19, color: C.muted, align: "left", margin: 0 });
s.addText("A hybrid computer-vision + explainable-ML + agentic-RAG valuation platform for the UAE.  ·  Live product.", { x: 0.62, y: 5.45, w: 12, h: 0.5, fontFace: BODY, fontSize: 13.5, color: C.dim, align: "left", margin: 0 });
s.addText("SP Jain School of Global Management  ·  Group Project", { x: 0.62, y: 6.5, w: 12, h: 0.4, fontFace: MONO, fontSize: 11, color: C.dim, charSpacing: 1, margin: 0 });

/* ── Slide 2 — Team ──────────────────────────────────────────── */
s = P.addSlide(); bg(s); kicker(s, "The team"); title(s, "Four builders, one system");
const team = [
  ["Krishna Mathur", "AS25DXB018", "Deep learning — the on-device damage detector (YOLOv8)"],
  ["Yash Petkar", "AS25DXB020", "Valuation model, data pipeline & the live product build"],
  ["Atharva Soundankar", "AS25DXB021", "Agentic backend, orchestration & the RAG retrieval layer"],
  ["[ Fourth member ]", "AS25DXB0__", "Frontend, UX & product — to be credited"],
];
team.forEach((m, i) => {
  const x = 0.6 + i * 3.05;
  s.addShape(P.ShapeType.roundRect, { x, y: 2.2, w: 2.85, h: 3.4, rectRadius: 0.1, fill: { color: C.surface }, line: { color: C.border, width: 1 } });
  s.addShape(P.ShapeType.ellipse, { x: x + 1.02, y: 2.55, w: 0.8, h: 0.8, fill: { color: C.amber } });
  s.addText(m[0].startsWith("[") ? "?" : m[0].split(" ").map((w) => w[0]).join("").slice(0, 2), { x: x + 1.02, y: 2.55, w: 0.8, h: 0.8, align: "center", valign: "middle", fontFace: HEAD, fontSize: 20, bold: true, color: C.bg, margin: 0 });
  s.addText(m[0], { x: x + 0.15, y: 3.5, w: 2.55, h: 0.4, align: "center", fontFace: HEAD, fontSize: 15, bold: true, color: C.fg, margin: 0 });
  s.addText(m[1], { x: x + 0.15, y: 3.9, w: 2.55, h: 0.3, align: "center", fontFace: MONO, fontSize: 10.5, color: C.amber, charSpacing: 1, margin: 0 });
  s.addText(m[2], { x: x + 0.2, y: 4.3, w: 2.45, h: 1.15, align: "center", valign: "top", fontFace: BODY, fontSize: 11.5, color: C.muted, margin: 0, lineSpacingMultiple: 1.05 });
});
s.addText("All four of us touched every layer — these were our anchors.", { x: 0.6, y: 5.95, w: 12, h: 0.4, align: "center", fontFace: BODY, fontSize: 13, italic: true, color: C.dim, margin: 0 });
footer(s, 2);

/* ── Slide 3 — Problem & market ──────────────────────────────── */
s = P.addSlide(); bg(s); kicker(s, "The problem"); title(s, "A used-car seller has a feeling.\nThe dealer has the data.");
bullets(s, 0.6, 2.6, 6.2, [
  "The UAE used-car market turns over ~1.5 million cars a year — and pricing is opaque.",
  "Sellers negotiate on a hunch; dealers do it all day and win every time.",
  "Existing tools give one number with no reasoning, no damage awareness, and no honesty about uncertainty.",
  "\"How much is my car worth, and can I defend that number?\" has no trustworthy answer.",
], 12);
card(s, 7.2, 2.5, 5.5, 1.35, "The gap", "Nobody gives the seller an explainable, damage-aware price they can actually argue with — for free.", C.amber);
stat(s, 7.4, 4.2, 2.6, "~1.5M", "used cars sold / year (UAE)");
stat(s, 10.1, 4.2, 2.6, "AED 8k", "typical mispricing per car");
stat(s, 7.4, 5.55, 2.6, "0", "tools that show their working");
stat(s, 10.1, 5.55, 2.6, "100%", "free to the seller");
footer(s, 3);

/* ── Slide 4 — Solution (hero) ───────────────────────────────── */
s = P.addSlide(); bg(s); kicker(s, "The product · live");
title(s, "Photos in. A defensible price out.", 0.6, 0.82, 7);
bullets(s, 0.6, 2.1, 5.0, [
  "Snap your car; a trained detector scans it for damage on your device.",
  "An explainable model prices it, showing every factor that moved the number.",
  "Live comparable listings and a written report — every figure traceable.",
  "Runs on free infrastructure; the whole thing is live today.",
], 10);
shot(s, SH("01_hero.png"), 5.9, 1.75, 6.9, 4.8);
footer(s, 4);

/* ── Slide 5 — Valuation + SHAP ──────────────────────────────── */
s = P.addSlide(); bg(s); kicker(s, "Explainable pricing");
title(s, "Not a number — a number with its reasons", 0.6, 0.82, 8);
shot(s, SH("02_valuation_shap.png"), 0.6, 2.0, 7.3, 4.6);
card(s, 8.2, 2.0, 4.5, 2.05, "Every driver, quantified", "SHAP shows exactly how each feature — cylinders, age, model, mileage — pushed the price up or down, in dirhams.", C.fg);
card(s, 8.2, 4.25, 4.5, 2.3, "Honest uncertainty", "A calibrated 78% confidence range from split-conformal prediction — not a false-precision point estimate. Median error is stated on the card.", C.info);
footer(s, 5);

/* ── Slide 6 — On-device CV ──────────────────────────────────── */
s = P.addSlide(); bg(s); kicker(s, "Deep learning · runs in your browser");
title(s, "A damage detector that never sees your photos", 0.6, 0.82, 9);
shot(s, SH("03_damage_cv.png"), 0.6, 2.0, 5.0, 4.6);
bullets(s, 6.0, 2.1, 6.6, [
  "YOLOv8-small, fine-tuned on ~18k images (CarDD + VehiDE), 8 damage classes.",
  "mAP@0.5 = 0.732 — a real, honestly-reported number.",
  "Exported to ONNX and run with onnxruntime-web — inference happens in the browser, so photos never leave the device.",
  "This also makes computer vision free at any scale: no server GPU, no per-image cost.",
  "The detected condition feeds straight into the price.",
], 9);
footer(s, 6);

/* ── Slide 7 — Repair + forecast ─────────────────────────────── */
s = P.addSlide(); bg(s); kicker(s, "From detection to decision");
title(s, "What the damage costs — and whether to fix it", 0.6, 0.82, 9);
shot(s, SH("04_repair.png"), 0.6, 2.0, 5.9, 4.5);
shot(s, SH("06_forecast.png"), 6.75, 2.0, 5.95, 4.5);
s.addText("Repair estimate: detection → itemised AED cost → a worth-fixing verdict.        Forecast: the same model, this car aged forward — real depreciation, not a rule of thumb.",
  { x: 0.6, y: 6.65, w: 12.1, h: 0.4, fontFace: BODY, fontSize: 11.5, italic: true, color: C.dim, align: "center", margin: 0 });
footer(s, 7);

/* ── Slide 8 — Market analytics ──────────────────────────────── */
s = P.addSlide(); bg(s); kicker(s, "Market context");
title(s, "Where your car sits in the real market", 0.6, 0.82, 9);
shot(s, SH("05_market_charts.png"), 4.4, 1.55, 4.55, 5.4);
card(s, 0.6, 2.0, 3.4, 2.2, "Price vs mileage", "Your car plotted against live Dubizzle comparables, inside the model's fair-value band.", C.fg);
card(s, 0.6, 4.4, 3.4, 2.2, "Market position", "A percentile gauge: is this priced high or low versus genuinely comparable cars?", C.info);
card(s, 9.35, 2.0, 3.4, 2.2, "Estimate vs each comp", "Your valuation bar-charted against every retrieved comparable listing.", C.fg);
card(s, 9.35, 4.4, 3.4, 2.2, "All theme-aware", "Every chart is responsive and renders in both light and dark mode.", C.good);
footer(s, 8);

/* ── Slide 9 — Grounded report + assistant ───────────────────── */
s = P.addSlide(); bg(s); kicker(s, "Agentic RAG · the trust layer");
title(s, "An AI that cannot invent a number", 0.6, 0.82, 9);
shot(s, SH("07_report_verifier.png"), 0.6, 2.0, 5.7, 4.6);
shot(s, SH("08_assistant.png"), 6.55, 2.0, 6.15, 3.15);
card(s, 6.55, 5.3, 6.15, 1.3, "The Verifier gate", "Every number in the report and the chat is checked against computed evidence. An ungrounded figure is rejected before you ever see it — faithfulness 1.000.", C.good);
footer(s, 9);

/* ── Slide 10 — Architecture + DL terms ──────────────────────── */
s = P.addSlide(); bg(s); kicker(s, "Under the hood");
title(s, "Three models, one honest pipeline", 0.6, 0.82, 9);
const flow = [
  ["Intake", "validate & normalise the vehicle", C.muted],
  ["Vision (CV)", "YOLOv8 → ONNX, on-device", C.amber],
  ["Pricing (ML)", "XGBoost quantile + conformal + SHAP", C.amber],
  ["Retrieval (RAG)", "hybrid: embeddings + BM25 + structured", C.amber],
  ["Report + Verifier", "LLM grounded, deterministically checked", C.good],
];
flow.forEach((f, i) => {
  const x = 0.6 + i * 2.5;
  s.addShape(P.ShapeType.roundRect, { x, y: 2.3, w: 2.28, h: 1.7, rectRadius: 0.08, fill: { color: C.surface }, line: { color: C.border, width: 1 } });
  s.addText(`${i + 1}`, { x: x + 0.12, y: 2.4, w: 0.5, h: 0.4, fontFace: MONO, fontSize: 13, bold: true, color: f[2], margin: 0 });
  s.addText(f[0], { x: x + 0.15, y: 2.85, w: 2.0, h: 0.4, fontFace: HEAD, fontSize: 13.5, bold: true, color: C.fg, margin: 0 });
  s.addText(f[1], { x: x + 0.15, y: 3.25, w: 2.0, h: 0.7, fontFace: BODY, fontSize: 10.5, color: C.muted, margin: 0, lineSpacingMultiple: 1.02 });
  if (i < flow.length - 1) s.addText("→", { x: x + 2.28, y: 2.9, w: 0.22, h: 0.5, align: "center", fontFace: HEAD, fontSize: 16, color: C.amber, margin: 0 });
});
s.addText([
  { text: "Deep-learning & ML applied:  ", options: { bold: true, color: C.fg } },
  { text: "CNN object detection · transfer learning · IoU / NMS · mAP · ONNX quantization · gradient-boosted trees · quantile regression · split-conformal prediction · SHAP attribution · sentence embeddings · BM25 · cross-encoder reranking · LangGraph agents · retrieval-augmented generation · deterministic verification.", options: { color: C.muted } },
], { x: 0.6, y: 4.5, w: 12.1, h: 1.7, fontFace: BODY, fontSize: 13, align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.15 });
s.addText("Stack:  Next.js (Vercel) · FastAPI (Render) · Supabase · Kaggle GPU · GitHub Actions — all free tier.", { x: 0.6, y: 6.35, w: 12, h: 0.4, fontFace: MONO, fontSize: 11, color: C.dim, margin: 0 });
footer(s, 10);

/* ── Slide 11 — Business / SaaS ──────────────────────────────── */
s = P.addSlide(); bg(s); kicker(s, "Business model · SaaS");
title(s, "Free for sellers. Paid for volume.", 0.6, 0.82, 9);
shot(s, SH("09_dealer.png"), 0.6, 2.0, 4.0, 2.75);
shot(s, SH("14_developers.png"), 4.75, 2.0, 4.0, 2.75);
shot(s, SH("12_pricing.png"), 8.9, 2.0, 3.85, 2.75);
s.addText("Dealer fleet valuation", { x: 0.6, y: 4.8, w: 4.0, h: 0.3, align: "center", fontFace: BODY, fontSize: 11, color: C.muted, margin: 0 });
s.addText("API keys + usage metering", { x: 4.75, y: 4.8, w: 4.0, h: 0.3, align: "center", fontFace: BODY, fontSize: 11, color: C.muted, margin: 0 });
s.addText("Plans: Free / Pro / Dealer", { x: 8.9, y: 4.8, w: 3.85, h: 0.3, align: "center", fontFace: BODY, fontSize: 11, color: C.muted, margin: 0 });
card(s, 0.6, 5.35, 12.13, 1.25, "The wedge", "The on-device CV makes the core product free to run — so we give it away and monetise the workflows businesses actually pay for: bulk fleet valuation, a metered API, and white-label reports. Every tier runs the same model and the same Verifier — paying more buys volume, never a different answer.", C.amber);
footer(s, 11);

/* ── Slide 12 — Evaluation & honest research ─────────────────── */
s = P.addSlide(); bg(s); kicker(s, "We measured, and reported what we found");
title(s, "Honesty as a feature", 0.6, 0.82, 9);
stat(s, 0.6, 2.2, 3.0, "0.732", "CV mAP@0.5 — reported, not rounded up");
stat(s, 3.7, 2.2, 3.0, "1.000", "report faithfulness (Verifier)");
stat(s, 6.8, 2.2, 3.0, "80.0%", "conformal coverage (target 80%)");
stat(s, 9.9, 2.2, 3.0, "0", "WCAG 2.1 AA violations");
card(s, 0.6, 3.75, 6.0, 2.75, "What the research found (D3)",
  "Raw quantile regression — the obvious thing to ship — promises 80% coverage and delivers 54.8%. The \"±25% rule of thumb\" delivers 56.3% and looks tight precisely because it's wrong. Split-conformal hits 80.0%. Without calibration the product would be confidently wrong in a way no user could detect.", C.info);
card(s, 6.85, 3.75, 5.85, 2.75, "What the research found (D5)",
  "We proved the retriever is at its mathematical ceiling: the benchmark's max score is 0.780 (porsche has 0 listings, 23 of 37 makes have <5), and it scores exactly 0.780. Retrieval is data-bound, not algorithm-bound — corpus growth is the only lever. Both findings argued against the obvious design choice.", C.info);
footer(s, 12);

/* ── Slide 13 — Score, verdict, close ────────────────────────── */
s = P.addSlide(); bg(s);
s.addShape(P.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.14, fill: { color: C.amber } });
kicker(s, "Where it stands");
title(s, "A real, honest, working MVP", 0.6, 0.82, 9);
s.addShape(P.ShapeType.roundRect, { x: 0.6, y: 2.1, w: 3.9, h: 2.5, rectRadius: 0.1, fill: { color: C.surface }, line: { color: C.amber, width: 1.5 } });
s.addText("90", { x: 0.6, y: 2.3, w: 3.9, h: 1.4, align: "center", fontFace: HEAD, fontSize: 72, bold: true, color: C.amber, margin: 0 });
s.addText("/ 100", { x: 0.6, y: 3.6, w: 3.9, h: 0.5, align: "center", fontFace: MONO, fontSize: 16, color: C.muted, margin: 0 });
s.addText("as a capstone product", { x: 0.6, y: 4.1, w: 3.9, h: 0.4, align: "center", fontFace: BODY, fontSize: 12.5, color: C.muted, margin: 0 });
card(s, 4.7, 2.1, 3.9, 2.5, "Real MVP?  ✓ Yes", "Live, usable end-to-end today: a stranger can value a car, see the reasoning, and get a defensible number. Not a mockup — a running system on real data.", C.good);
card(s, 8.8, 2.1, 3.95, 2.5, "SaaS-ready?  ~72 / 100", "Auth, API keys, metering, plans, dealer bulk and white-label all built. Remaining: real payments, a bigger corpus, and production CV scale.", C.info);
bullets(s, 0.6, 5.0, 12.0, [
  "Everything shown is live, free-tier, and reproducible — the metrics page is public.",
  "The honest gaps are named, not hidden: thin corpus (Phase E cron is growing it), test-mode payments, single-region.",
], 8);
s.addText("Thank you.  ·  AutoValuate Intelligence  ·  auto-valuate-intelligence.vercel.app", { x: 0.6, y: 6.6, w: 12.1, h: 0.4, fontFace: MONO, fontSize: 12, color: C.amber, align: "center", charSpacing: 1, margin: 0 });
footer(s, 13);

P.writeFile({ fileName: path.join(__dirname, "AutoValuate_Deck_v2.pptx") }).then((f) => console.log("wrote", f));
