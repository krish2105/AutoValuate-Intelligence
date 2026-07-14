/* AutoValuate Intelligence — 19-slide professional group deck. Dark automotive theme, real assets/numbers, no repo link. */
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
const SS = (f) => path.join(__dirname, "screenshots", f);
const AS = (f) => path.join(__dirname, "assets", f);
const TOTAL = 19;

function bg(s, color) { s.background = { color: color || C.bg }; }
function pill(s, x, y, text, col) {
  s.addText(text.toUpperCase(), { x, y, w: 6.5, h: 0.32, align: "left", valign: "middle", fontFace: MONO, fontSize: 10.5, color: col || C.amber, bold: true, charSpacing: 2, margin: 0 });
}
function shadow() { return { type: "outer", color: "000000", opacity: 0.55, blur: 14, offset: 6, angle: 90 }; }
function shot(s, file, x, y, w, h) {
  s.addShape(P.ShapeType.roundRect, { x: x - 0.04, y: y - 0.04, w: w + 0.08, h: h + 0.08, rectRadius: 0.1, fill: { color: C.surface }, line: { color: C.border, width: 1 }, shadow: shadow() });
  s.addImage({ path: file, x, y, w, h, sizing: { type: "contain", w, h } });
}
function title(s, t, x, y, w) {
  s.addText(t, { x: x || 0.6, y: y || 0.9, w: w || 8.4, h: 1.0, fontFace: HEAD, fontSize: 33, bold: true, color: C.fg, align: "left", valign: "top", margin: 0 });
}
function stat(s, x, y, w, num, label, col) {
  s.addText(num, { x, y, w, h: 0.9, fontFace: MONO, fontSize: 38, bold: true, color: col || C.amber, align: "left", margin: 0 });
  s.addText(label, { x, y: y + 0.84, w, h: 0.5, fontFace: BODY, fontSize: 12.5, color: C.muted, align: "left", margin: 0 });
}
function card(s, x, y, w, h, header, body, hcol) {
  s.addShape(P.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.09, fill: { color: C.surface }, line: { color: C.border, width: 1 } });
  s.addText(header, { x: x + 0.22, y: y + 0.16, w: w - 0.44, h: 0.4, fontFace: HEAD, fontSize: 15, bold: true, color: hcol || C.fg, align: "left", margin: 0 });
  s.addText(body, { x: x + 0.22, y: y + 0.62, w: w - 0.44, h: h - 0.8, fontFace: BODY, fontSize: 12.5, color: C.muted, align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.05 });
}
function dot(s, x, y, col) { s.addShape(P.ShapeType.ellipse, { x, y, w: 0.14, h: 0.14, fill: { color: col } }); }
function footer(s, n) {
  s.addText("AutoValuate Intelligence  ·  SP Jain", { x: 0.6, y: 7.02, w: 6, h: 0.3, fontFace: BODY, fontSize: 9, color: C.dim, align: "left", margin: 0 });
  s.addText(`${n} / ${TOTAL}`, { x: 11.8, y: 7.02, w: 0.9, h: 0.3, fontFace: MONO, fontSize: 9, color: C.dim, align: "right", margin: 0 });
}
let s;

/* 1 · TITLE */
s = P.addSlide(); bg(s);
s.addShape(P.ShapeType.roundRect, { x: 0.7, y: 0.7, w: 0.9, h: 0.9, rectRadius: 0.16, fill: { color: C.amber }, shadow: shadow() });
s.addText("◔", { x: 0.7, y: 0.66, w: 0.9, h: 0.9, fontFace: HEAD, fontSize: 34, bold: true, color: C.bg, align: "center", valign: "middle", margin: 0 });
s.addText("AutoValuate", { x: 1.75, y: 0.72, w: 6, h: 0.55, fontFace: HEAD, fontSize: 26, bold: true, color: C.fg, margin: 0 });
s.addText("INTELLIGENCE", { x: 1.77, y: 1.18, w: 6, h: 0.35, fontFace: MONO, fontSize: 12, color: C.muted, charSpacing: 4, margin: 0 });
s.addText("Explainable, damage-aware\ncar valuation for the UAE.", { x: 0.7, y: 2.55, w: 7.6, h: 1.5, fontFace: HEAD, fontSize: 37, bold: true, color: C.fg, align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.0 });
s.addText([{ text: "One trained damage detector · one explainable price model · one agentic-RAG layer — ", options: { color: C.muted } }, { text: "every number citation-grounded.", options: { color: C.amber, bold: true } }], { x: 0.7, y: 4.35, w: 7.1, h: 0.9, fontFace: BODY, fontSize: 15, align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.1 });
s.addText("A group capstone · MAIB · SP Jain School of Global Management, Dubai", { x: 0.7, y: 5.9, w: 7.4, h: 0.4, fontFace: BODY, fontSize: 13.5, color: C.muted, margin: 0 });
shot(s, SS("01_hero_form_dark.png"), 8.5, 1.5, 4.35, 4.6);

/* 2 · TEAM */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.55, "The team"); title(s, "Four builders, one hybrid system.");
const team = [["Krishna Mathur", "AS25DXB018", "Deep learning · CV detector", C.amber], ["Yash Petkar", "AS25DXB020", "Valuation ML · data", C.info], ["Atharva Soundankar", "AS25DXB021", "Agentic RAG · backend", C.good], ["Member 4", "TBC", "Frontend · product", C.muted]];
team.forEach((m, i) => {
  const x = 0.6 + i * 3.08;
  s.addShape(P.ShapeType.roundRect, { x, y: 2.2, w: 2.85, h: 3.4, rectRadius: 0.1, fill: { color: C.surface }, line: { color: C.border, width: 1 } });
  s.addShape(P.ShapeType.ellipse, { x: x + 0.95, y: 2.55, w: 0.95, h: 0.95, fill: { color: C.surf2 }, line: { color: m[3], width: 1.5 } });
  s.addText(m[0].split(" ").map((w) => w[0]).join("").slice(0, 2), { x: x + 0.95, y: 2.55, w: 0.95, h: 0.95, fontFace: HEAD, fontSize: 22, bold: true, color: m[3], align: "center", valign: "middle", margin: 0 });
  s.addText(m[0], { x: x + 0.15, y: 3.7, w: 2.55, h: 0.6, fontFace: HEAD, fontSize: 15, bold: true, color: C.fg, align: "center", margin: 0 });
  s.addText(m[1], { x: x + 0.15, y: 4.25, w: 2.55, h: 0.35, fontFace: MONO, fontSize: 11, color: C.muted, align: "center", margin: 0 });
  s.addText(m[2], { x: x + 0.15, y: 4.75, w: 2.55, h: 0.7, fontFace: BODY, fontSize: 12, color: m[3], align: "center", margin: 0, lineSpacingMultiple: 1.05 });
});
s.addText("Roles show each member's primary focus; the build was collaborative across all four pillars.", { x: 0.6, y: 6.0, w: 12, h: 0.4, fontFace: BODY, fontSize: 12, italic: true, color: C.dim, margin: 0 });
footer(s, 2);

/* 3 · PROBLEM */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.55, "The problem"); title(s, "Everyone selling a car gets lowballed.");
stat(s, 0.6, 2.15, 5.6, "$20.6B", "UAE used-car market by 2026 — large, real, still growing", C.amber);
card(s, 0.6, 3.7, 3.75, 2.7, "Dealers quote low", "They quote below market to protect their own resale margin. You have no independent number to push back with.", C.fg);
card(s, 4.55, 3.7, 3.75, 2.7, "Classifieds mislead", "Listing sites show asking prices, not what cars actually sell for. Anchoring on them overprices your car.", C.fg);
card(s, 8.5, 3.7, 4.2, 2.7, "Damage is guesswork", "Both sides price that door dent by gut feeling. Nobody quantifies what a specific dent, at this mileage, actually costs.", C.fg);
footer(s, 3);

/* 4 · MARKET OPPORTUNITY  (refined with research) */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.55, "Market opportunity"); title(s, "A big, high-churn market going online.");
stat(s, 0.6, 2.2, 3.9, "~2x", "UAE used-to-new car sales ratio — resale is the bigger market", C.amber);
stat(s, 4.7, 2.2, 3.9, "High", "expat turnover → cars change hands fast and often", C.info);
stat(s, 8.8, 2.2, 3.9, "Rising", "buyers now start online — instant valuation is table-stakes", C.good);
card(s, 0.6, 4.25, 12.1, 2.1, "Why now", "The used-car market here is worth tens of billions and still growing, and the buying journey has moved online. Marketplaces and dealers increasingly want a trustworthy, instant, damage-aware price to reduce disputes and speed up deals. That's the wedge: a verified estimate that anyone can generate in seconds and defend with evidence.", C.fg);
footer(s, 4);

/* 5 · WHY EXISTING TOOLS FALL SHORT */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.55, "Why existing tools fall short"); title(s, "Each piece exists. Nobody stitches them together.");
s.addText("Instant-offer and classifieds players (dubizzle / Sell Any Car, SellAnyCar.com, CarSwitch, Seez, dubicars, YallaMotor) each solve part of it. None gives a seller a transparent, damage-aware price that shows its reasoning. To do the job properly you need all three at once:", { x: 0.6, y: 1.85, w: 12.1, h: 1.05, fontFace: BODY, fontSize: 14, color: C.muted, margin: 0, lineSpacingMultiple: 1.12 });
[["Visual damage assessment", "Sees the dents, scratches, cracks — and localizes them."], ["Explainable pricing", "Shows exactly why it reached a number, factor by factor."], ["Live comparable evidence", "Backs the estimate with real listings you can open."]].forEach((c2, i) => {
  const x = 0.6 + i * 4.15;
  s.addShape(P.ShapeType.roundRect, { x, y: 3.15, w: 3.85, h: 2.75, rectRadius: 0.09, fill: { color: C.surface }, line: { color: C.border, width: 1 } });
  s.addShape(P.ShapeType.ellipse, { x: x + 0.22, y: 3.4, w: 0.5, h: 0.5, fill: { color: C.good } });
  s.addText("✓", { x: x + 0.22, y: 3.39, w: 0.5, h: 0.5, fontFace: HEAD, fontSize: 20, bold: true, color: C.bg, align: "center", valign: "middle", margin: 0 });
  s.addText(c2[0], { x: x + 0.22, y: 4.1, w: 3.4, h: 0.6, fontFace: HEAD, fontSize: 15, bold: true, color: C.fg, margin: 0 });
  s.addText(c2[1], { x: x + 0.22, y: 4.75, w: 3.4, h: 1.0, fontFace: BODY, fontSize: 12.5, color: C.muted, margin: 0, lineSpacingMultiple: 1.1 });
});
s.addText("AutoValuate is the one report that carries all three — and ties every claim back to the model that produced it.", { x: 0.6, y: 6.15, w: 12, h: 0.5, fontFace: BODY, fontSize: 13.5, italic: true, color: C.amber, margin: 0 });
footer(s, 5);

/* 6 · SOLUTION IN ONE PICTURE */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.55, "The solution"); title(s, "Photos in. A trustworthy, explained number out.");
[["Photos + details", "in", C.info], ["Damage · price · comparables", "three models", C.amber], ["Plain-English report", "out", C.good]].forEach((f, i) => {
  const x = 0.75 + i * 4.25;
  s.addShape(P.ShapeType.roundRect, { x, y: 2.6, w: 3.5, h: 1.7, rectRadius: 0.12, fill: { color: C.surface }, line: { color: f[2], width: 1.5 } });
  s.addText(f[1].toUpperCase(), { x: x + 0.25, y: 2.8, w: 3, h: 0.3, fontFace: MONO, fontSize: 10, color: f[2], bold: true, charSpacing: 2, margin: 0 });
  s.addText(f[0], { x: x + 0.25, y: 3.2, w: 3, h: 0.9, fontFace: HEAD, fontSize: 17, bold: true, color: C.fg, valign: "top", margin: 0 });
  if (i < 2) s.addText("→", { x: x + 3.55, y: 2.9, w: 0.65, h: 1.1, fontFace: HEAD, fontSize: 30, color: C.dim, align: "center", valign: "middle", margin: 0 });
});
s.addText("No black box: the middle step is a purpose-trained CV model, a gradient-boosted price model with SHAP, and a hybrid retrieval layer — not one LLM guessing.", { x: 0.75, y: 5.1, w: 11.8, h: 1.0, fontFace: BODY, fontSize: 15, color: C.muted, margin: 0, lineSpacingMultiple: 1.15 });
footer(s, 6);

/* 7 · LIVE DEMO */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.55, "Let's see it work");
s.addText("This is the running app.", { x: 0.6, y: 0.95, w: 6.5, h: 0.9, fontFace: HEAD, fontSize: 32, bold: true, color: C.fg, margin: 0 });
s.addText("Everything on the next slides is a screenshot of this exact system — not a mockup. We'll switch to it live now and value a real car end to end.", { x: 0.6, y: 2.0, w: 6.3, h: 1.3, fontFace: BODY, fontSize: 15, color: C.muted, margin: 0, lineSpacingMultiple: 1.2 });
s.addText([{ text: "Live:  ", options: { color: C.muted } }, { text: "autovaluate.vercel.app", options: { color: C.amber, bold: true } }, { text: "   (deploying — runs locally today)", options: { color: C.dim } }], { x: 0.6, y: 3.5, w: 6.3, h: 0.4, fontFace: MONO, fontSize: 12.5, margin: 0 });
s.addText("Every number you'll see reproduces from our evaluation suite — one command, all green.", { x: 0.6, y: 4.5, w: 6.3, h: 1.0, fontFace: BODY, fontSize: 13.5, italic: true, color: C.good, margin: 0, lineSpacingMultiple: 1.15 });
shot(s, SS("06_full_dark.png"), 7.6, 0.7, 5.2, 6.1);
footer(s, 7);

/* 8 · ARCHITECTURE */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.5, "System architecture"); title(s, "A genuine hybrid — three AI systems, one product.", 0.6, 0.82, 12);
shot(s, AS("architecture.png"), 0.6, 1.75, 12.13, 5.0);
footer(s, 8);

/* 9 · DEEP LEARNING: DETECTOR */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.55, "Deep learning · the damage detector"); title(s, "A model trained to see damage — and where it is.");
card(s, 0.6, 2.0, 5.9, 1.55, "~18,000 real annotated images", "CarDD + VehiDE, unified into one 8-class schema (dent, scratch, crack, glass shatter, lamp broken, tire flat, punctured, missing part).", C.amber);
card(s, 0.6, 3.75, 5.9, 1.55, "YOLOv8 detection, not classification", "Location matters for pricing — a windshield crack costs differently than a bumper scratch. So we detect and localize, not just label.", C.info);
card(s, 0.6, 5.5, 5.9, 1.15, "Verified pipeline", "14,437 training + 1,184 validation images unified on Kaggle; ONNX export runs CPU-only on the free Hugging Face Space.", C.good);
shot(s, SS("06_full_light.png"), 7.0, 1.8, 5.8, 4.9);
footer(s, 9);

/* 10 · CV RESULTS (honest / pending) */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.55, "CV results"); title(s, "Honest numbers — the detector is still training.");
s.addShape(P.ShapeType.roundRect, { x: 0.6, y: 2.1, w: 5.9, h: 2.3, rectRadius: 0.1, fill: { color: C.surface }, line: { color: C.amber, width: 1.5 } });
s.addText("mAP@0.5", { x: 0.85, y: 2.35, w: 5, h: 0.4, fontFace: BODY, fontSize: 14, color: C.muted, margin: 0 });
s.addText("lands here", { x: 0.85, y: 2.75, w: 5.4, h: 0.9, fontFace: MONO, fontSize: 34, bold: true, color: C.amber, margin: 0 });
s.addText("held-out, per-class P·R from notebook 03", { x: 0.85, y: 3.7, w: 5.4, h: 0.5, fontFace: BODY, fontSize: 11.5, italic: true, color: C.dim, margin: 0 });
card(s, 6.8, 2.1, 5.95, 2.3, "Why it's blank — and why that's the right call", "The YOLOv8 fine-tune is running on Kaggle's free P100. We won't print a fabricated mAP. The eval harness already computes it on a strictly held-out split (no early-stop leakage), so the real number drops straight in when the run finishes.", C.fg);
s.addText("What is already real and audited:", { x: 0.6, y: 4.75, w: 12, h: 0.4, fontFace: HEAD, fontSize: 14, bold: true, color: C.fg, margin: 0 });
[["8-class unified dataset", "14,437 train / 1,184 val — merged from CarDD + VehiDE, nothing dropped"], ["Leakage-safe eval", "held-out half of val by deterministic hash; ONNX-vs-PyTorch parity check"], ["Deploy path proven", "CPU ONNX service, full decode + NMS verified on synthetic output"]].forEach((r, i) => {
  const x = 0.6 + i * 4.15;
  s.addShape(P.ShapeType.roundRect, { x, y: 5.25, w: 3.85, h: 1.35, rectRadius: 0.08, fill: { color: C.surf2 }, line: { color: C.border, width: 1 } });
  s.addText(r[0], { x: x + 0.2, y: 5.4, w: 3.5, h: 0.4, fontFace: HEAD, fontSize: 12.5, bold: true, color: C.good, margin: 0 });
  s.addText(r[1], { x: x + 0.2, y: 5.8, w: 3.5, h: 0.75, fontFace: BODY, fontSize: 11, color: C.muted, margin: 0, lineSpacingMultiple: 1.05 });
});
footer(s, 10);

/* 11 · CLASSICAL ML: VALUATION */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.55, "Explainable ML · the valuation model"); title(s, "A price you can interrogate, factor by factor.");
stat(s, 0.6, 2.05, 3.0, "19.6%", "median error (held-out CV)", C.amber);
stat(s, 3.7, 2.05, 3.0, "+28.4%", "better than a naive baseline", C.good);
stat(s, 0.6, 3.75, 3.0, "0.80", "calibrated price-interval coverage", C.info);
stat(s, 3.7, 3.75, 3.0, "3 / 3", "SHAP directional checks pass", C.good);
s.addText("XGBoost quantile model on 672 real Dubizzle listings. SHAP explains each estimate; a split-conformal interval makes the stated 80% range mean 80%. Mileage and age push price down, newer year lifts it — exactly as economics demands.", { x: 0.6, y: 5.5, w: 6.1, h: 1.3, fontFace: BODY, fontSize: 12.5, color: C.muted, margin: 0, lineSpacingMultiple: 1.15 });
shot(s, SS("03_valuation_shap_dark.png"), 7.0, 1.9, 5.8, 4.6);
footer(s, 11);

/* 12 · AGENTIC LAYER */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.55, "The agentic layer"); title(s, "Seven agents, streamed live — and a hard gate.");
card(s, 0.6, 2.0, 6.0, 1.5, "LangGraph orchestration", "Intake → Aggregation (CV) → Valuation → Comparables → Report → Verifier → Confidence. Each step streams to the UI over SSE, so you watch the reasoning happen.", C.fg);
card(s, 0.6, 3.65, 6.0, 1.65, "The Verifier — a real gate, not a promise", "Every AED figure and citation in the report must trace to a computed value. In testing it caught an injected AED 999,999, a fake citation, and an ungrounded percentage.", C.amber);
card(s, 0.6, 5.45, 6.0, 1.2, "Never blank", "Gemini writes the report, Groq is the fallback, and a deterministic writer keeps it working with no keys at all.", C.info);
shot(s, SS("02_live_trace_dark.png"), 7.1, 1.9, 5.7, 4.7);
footer(s, 12);

/* 13 · RESPONSIBLE AI */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.55, "Responsible AI"); title(s, "It tells you how sure it is — and when not to trust it.");
card(s, 0.6, 2.0, 6.0, 1.45, "States its confidence", "Every report gives the price-interval width and, when photos are provided, the detector's per-damage confidence.", C.fg);
card(s, 0.6, 3.6, 6.0, 1.45, "Recommends inspection when unsure", "Low or moderate confidence triggers a plain-English 'get a professional inspection' — it never presents a false-certain number.", C.amber);
card(s, 0.6, 5.2, 6.0, 1.45, "Enforced, not aspirational", "The disclosure contract is a test: 90 checks across 18 vehicles, zero failures. It never claims to be a certified appraisal.", C.good);
shot(s, SS("05_report_citations_light.png"), 7.1, 1.9, 5.7, 4.7);
footer(s, 13);

/* 14 · BUSINESS MODEL / WHO PAYS */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.55, "Business model · who pays"); title(s, "Free for sellers. Dealers and marketplaces pay.");
[["Individual sellers", "Free", "3 valuations / month. Builds the top of the funnel and the data flywheel.", C.info],
 ["Used-car dealers", "SaaS seats", "Bulk trade-in intake + a defensible, damage-aware price to justify offers. The paying core.", C.amber],
 ["Marketplaces / OEMs", "API licence", "A 'verified estimate' badge and damage API on their own listings. Highest-value, B2B.", C.good]].forEach((r, i) => {
  const x = 0.6 + i * 4.15;
  s.addShape(P.ShapeType.roundRect, { x, y: 2.15, w: 3.85, h: 3.7, rectRadius: 0.1, fill: { color: C.surface }, line: { color: C.border, width: 1 } });
  s.addText(r[0], { x: x + 0.22, y: 2.4, w: 3.4, h: 0.5, fontFace: HEAD, fontSize: 15, bold: true, color: C.fg, margin: 0 });
  s.addText(r[1].toUpperCase(), { x: x + 0.22, y: 2.95, w: 3.4, h: 0.4, fontFace: MONO, fontSize: 12, bold: true, color: r[3], charSpacing: 1, margin: 0 });
  s.addText(r[2], { x: x + 0.22, y: 3.55, w: 3.4, h: 2.0, fontFace: BODY, fontSize: 12.5, color: C.muted, margin: 0, lineSpacingMultiple: 1.15 });
});
s.addText("MVP proves the engine; the dealer tier is the first revenue and the near-term focus.", { x: 0.6, y: 6.1, w: 12, h: 0.4, fontFace: BODY, fontSize: 12.5, italic: true, color: C.amber, margin: 0 });
footer(s, 14);

/* 15 · TECH STACK / WHY FREE */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.55, "The stack · and why it's all free"); title(s, "Zero cost — with the engineering judgment to prove it.");
[["Vercel", "Frontend (Next.js)"], ["Render", "Orchestration API"], ["Hugging Face", "CV inference · CPU Basic"], ["Supabase", "Postgres · pgvector · Auth"], ["Kaggle", "GPU training (offline)"], ["Gemini / Groq", "LLM report writer"]].forEach((h, i) => {
  const x = 0.6 + (i % 3) * 4.15, y = 2.0 + Math.floor(i / 3) * 1.35;
  s.addShape(P.ShapeType.roundRect, { x, y, w: 3.85, h: 1.15, rectRadius: 0.08, fill: { color: C.surface }, line: { color: C.border, width: 1 } });
  s.addText(h[0], { x: x + 0.2, y: y + 0.16, w: 3.5, h: 0.4, fontFace: HEAD, fontSize: 14, bold: true, color: C.fg, margin: 0 });
  s.addText(h[1], { x: x + 0.2, y: y + 0.58, w: 3.5, h: 0.4, fontFace: MONO, fontSize: 10.5, color: C.info, margin: 0 });
});
s.addText([{ text: "Render, not Railway", options: { bold: true, color: C.amber } }, { text: " (Railway has no real free tier in 2026).   ", options: { color: C.muted } }, { text: "The CV model runs on Hugging Face", options: { bold: true, color: C.amber } }, { text: " — 512MB can't hold it.   ", options: { color: C.muted } }, { text: "A scheduled ping", options: { bold: true, color: C.amber } }, { text: " keeps Supabase awake, so the link never dies.", options: { color: C.muted } }], { x: 0.6, y: 5.35, w: 12.1, h: 1.3, fontFace: BODY, fontSize: 13.5, margin: 0, lineSpacingMultiple: 1.25 });
footer(s, 15);

/* 16 · EVALUATION SUMMARY */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.55, "Evaluation summary"); title(s, "Every number here reproduces from one command.");
[["19.6%", "valuation median error", C.amber], ["1.00", "comparables same-make P@5", C.good], ["1.000", "report faithfulness", C.good], ["0.000", "faithfulness — hallucinated control", C.bad], ["90 / 90", "confidence-contract checks", C.info], ["53", "integration checks, all green", C.info]].forEach((e, i) => {
  const x = 0.6 + (i % 3) * 4.15, y = 2.0 + Math.floor(i / 3) * 1.75;
  s.addShape(P.ShapeType.roundRect, { x, y, w: 3.85, h: 1.5, rectRadius: 0.09, fill: { color: C.surface }, line: { color: C.border, width: 1 } });
  s.addText(e[0], { x: x + 0.25, y: y + 0.22, w: 3.4, h: 0.7, fontFace: MONO, fontSize: 30, bold: true, color: e[2], margin: 0 });
  s.addText(e[1], { x: x + 0.25, y: y + 0.95, w: 3.4, h: 0.45, fontFace: BODY, fontSize: 11.5, color: C.muted, margin: 0 });
});
s.addText("CV mAP@0.5 lands here once training finishes — the same held-out harness, no placeholder in its place.", { x: 0.6, y: 5.7, w: 12, h: 0.5, fontFace: BODY, fontSize: 12.5, italic: true, color: C.amber, margin: 0 });
footer(s, 16);

/* 17 · LIMITATIONS */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.55, "Limitations & honest scope"); title(s, "What it does not do — named on purpose.");
[["CV detector still training", "The mAP isn't in yet; the deep-learning claim rests on the finished run, and we'd rather show that than a guess."],
 ["No accounts yet", "Auth, saved history per user, and multi-tenant isolation are the next build — today it's a single-session tool."],
 ["Modest tabular set", "672 real listings is small, so the price interval is genuinely wide — which is why the range is disclosed, not hidden."],
 ["No accident-history feed", "There's no free UAE accident-record API, so the estimate can't see undisclosed history — hence 'get an inspection.'"]].forEach((r, i) => {
  const x = 0.6 + (i % 2) * 6.2, y = 2.1 + Math.floor(i / 2) * 2.25;
  card(s, x, y, 5.9, 2.0, r[0], r[1], C.fg);
});
footer(s, 17);

/* 18 · ROADMAP */
s = P.addSlide(); bg(s); pill(s, 0.6, 0.55, "Roadmap"); title(s, "From capstone to first paying dealer.");
[["Next 30 days", "Finish CV training, add Supabase Auth + saved history, ship the ONNX query-embedder so it runs in Render's free RAM, deploy all three URLs.", C.amber],
 ["60–90 days", "Dealer workspace: bulk intake, PDF reports, per-seat quotas. Pilot with one Sharjah/Dubai used-car dealer for real feedback.", C.info],
 ["6 months", "Verified-estimate API for a marketplace, price-trend alerts, and a Dubizzle auto-fill extension — the retention and B2B layers.", C.good]].forEach((r, i) => {
  const x = 0.6 + i * 4.15;
  s.addShape(P.ShapeType.roundRect, { x, y: 2.4, w: 3.85, h: 3.5, rectRadius: 0.1, fill: { color: C.surface }, line: { color: C.border, width: 1 } });
  s.addText(r[0], { x: x + 0.25, y: 2.65, w: 3.4, h: 0.5, fontFace: HEAD, fontSize: 16, bold: true, color: r[2], margin: 0 });
  s.addText(r[1], { x: x + 0.25, y: 3.3, w: 3.4, h: 2.4, fontFace: BODY, fontSize: 12.5, color: C.muted, margin: 0, lineSpacingMultiple: 1.2 });
});
footer(s, 18);

/* 19 · CLOSE */
s = P.addSlide(); bg(s);
s.addText("One project, three things proven.", { x: 0.7, y: 0.85, w: 12, h: 0.9, fontFace: HEAD, fontSize: 33, bold: true, color: C.fg, margin: 0 });
[["Deep learning", "a trained, evaluated CV damage detector", C.amber], ["Explainable ML", "XGBoost + SHAP, a price you can interrogate", C.info], ["Agentic RAG", "orchestration with a hard citation gate", C.good]].forEach((r, i) => {
  const y = 1.95 + i * 1.0;
  dot(s, 0.75, y + 0.14, r[2]);
  s.addText(r[0], { x: 1.1, y, w: 3.4, h: 0.5, fontFace: HEAD, fontSize: 18, bold: true, color: C.fg, margin: 0 });
  s.addText(r[1], { x: 4.4, y: y + 0.02, w: 8, h: 0.5, fontFace: BODY, fontSize: 14, color: C.muted, margin: 0 });
});
s.addText("Team", { x: 0.75, y: 5.05, w: 3, h: 0.35, fontFace: MONO, fontSize: 11, color: C.dim, charSpacing: 2, margin: 0 });
s.addText("Krishna Mathur · Yash Petkar · Atharva Soundankar · +1", { x: 0.75, y: 5.4, w: 11, h: 0.4, fontFace: BODY, fontSize: 13.5, color: C.fg, margin: 0 });
s.addText("Thank you — happy to open any part of it live.", { x: 0.75, y: 6.35, w: 11, h: 0.5, fontFace: HEAD, fontSize: 18, bold: true, color: C.amber, margin: 0 });

/* speaker notes (condensed; the full 15-min script is the .md) */
const notes = [
  "Hook: a friend selling a car, lowballed by 8k because he had a feeling, not a number. That's why we built this. ~50s.",
  "Introduce the four of us and our focus areas. Keep it quick and warm. ~40s.",
  "The market is huge and real — 20.6B by 2026. Three pains: dealers quote low, classifieds mislead, damage is guesswork. ~50s.",
  "Why now: high-churn expat market moving online, marketplaces want a trustworthy instant price. This is the wedge. ~50s.",
  "Competitors each solve part of it; nobody combines damage + explainable price + comparables. That's our gap. ~50s.",
  "One mental model: photos in, explained number out; the middle is three real models, not one LLM. ~40s.",
  "Switch to the live app. Value a real car end to end. Invite them to reproduce the numbers. ~70s + demo.",
  "The one-picture architecture: a trained CV model AND a classical ML model AND an agentic layer. A hybrid, not a wrapper. ~55s.",
  "Deep-learning core: 18k real images, detection not classification because location changes price. Name the datasets. ~55s.",
  "Be upfront: detector still training, no fabricated mAP. Show what's already real — dataset, leakage-safe eval, deploy path. ~55s.",
  "Price model: 19.6% median error, 28% over baseline, calibrated interval, directional checks pass. Point at SHAP bars. ~55s.",
  "Agentic layer: seven agents streamed live; the Verifier caught injected fakes in testing. Honesty enforced in code. ~55s.",
  "Responsible AI: states confidence, recommends inspection, passing test not a promise, never a certified appraisal. ~50s.",
  "Business model: free for sellers, dealers pay for seats, marketplaces licence the API. Dealer tier is first revenue. ~50s.",
  "Stack and judgment: Render not Railway, CV on Hugging Face, Supabase keep-alive. Engineering decisions, not tutorial-following. ~45s.",
  "Consolidated numbers, all reproducible. The 0.000 control proves the faithfulness metric discriminates. mAP joins here. ~45s.",
  "Limitations named plainly: training not finished, no accounts yet, small dataset, no accident feed. Maturity signal. ~50s.",
  "Roadmap: 30 days to deploy + auth, 60-90 to a dealer pilot, 6 months to the B2B API. Capstone to first paying dealer. ~45s.",
  "Recap the three proven capabilities, thank the audience by name as a team, offer to open anything live. ~40s.",
];
P.slides.forEach((sl, i) => sl.addNotes(notes[i]));

P.writeFile({ fileName: path.join(__dirname, "AutoValuate_Intelligence_Deck.pptx") }).then((f) => console.log("wrote", f));
