/* AutoValuate Intelligence — 15-slide deck, v3.
 *
 * Verified against repository commit 14a84088bbf6b70340221538765ddb692fb46ce3 (main),
 * audited 2026-07-27. Screenshots in shots-v3/ were captured from the LIVE Vercel
 * deployment in light mode on the same date; every number on a slide traces to a committed
 * eval artefact (eval/*.json) or a live measurement recorded in the repo.
 *
 * Five presenters, three slides each, ~20 minutes total. Speaker notes are written as
 * natural speech and double as the presentation script (also emitted to
 * AutoValuate_Script_v3.md by this file).
 *
 * Build:  node build_deck_v3.js   (from docs/presentation/)
 */
const pptxgen = require("pptxgenjs");
const path = require("path");
const fs = require("fs");

const COMMIT = "14a84088bbf6b70340221538765ddb692fb46ce3";
const COMMIT_SHORT = "14a8408";
const REVIEWED = "27 July 2026";

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
const SH = (f) => path.join(__dirname, "shots-v3", f);

const NOTES = []; // [slide n, presenter, text] — also emitted as the script file

function bg(s, color) { s.background = { color: color || C.bg }; }
function shadow() { return { type: "outer", color: "000000", opacity: 0.5, blur: 12, offset: 5, angle: 90 }; }
function kicker(s, text, x, y) {
  s.addText(text.toUpperCase(), { x: x ?? 0.6, y: y ?? 0.42, w: 10, h: 0.3, fontFace: MONO, fontSize: 11, color: C.amber, bold: true, charSpacing: 2, margin: 0 });
}
function title(s, t, x, y, w, size) {
  s.addText(t, { x: x ?? 0.6, y: y ?? 0.74, w: w ?? 12.1, h: 1.0, fontFace: HEAD, fontSize: size ?? 30, bold: true, color: C.fg, align: "left", valign: "top", margin: 0 });
}
function shot(s, file, x, y, w, h) {
  s.addShape(P.ShapeType.roundRect, { x: x - 0.05, y: y - 0.05, w: w + 0.1, h: h + 0.1, rectRadius: 0.1, fill: { color: "FFFFFF" }, line: { color: C.border, width: 1 }, shadow: shadow() });
  s.addImage({ path: file, x, y, w, h, sizing: { type: "contain", w, h } });
}
function card(s, x, y, w, h, header, body, hcol) {
  s.addShape(P.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.09, fill: { color: C.surface }, line: { color: C.border, width: 1 } });
  s.addText(header, { x: x + 0.22, y: y + 0.16, w: w - 0.44, h: 0.4, fontFace: HEAD, fontSize: 14, bold: true, color: hcol || C.fg, align: "left", margin: 0 });
  s.addText(body, { x: x + 0.22, y: y + 0.58, w: w - 0.44, h: h - 0.76, fontFace: BODY, fontSize: 11.5, color: C.muted, align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.06 });
}
function stat(s, x, y, w, num, label, col) {
  s.addText(num, { x, y, w, h: 0.7, fontFace: MONO, fontSize: 28, bold: true, color: col || C.amber, align: "left", margin: 0 });
  s.addText(label, { x, y: y + 0.66, w, h: 0.62, fontFace: BODY, fontSize: 11, color: C.muted, align: "left", margin: 0, lineSpacingMultiple: 1.0 });
}
function footer(s, n) {
  s.addText("AutoValuate Intelligence", { x: 0.6, y: 7.1, w: 6, h: 0.28, fontFace: BODY, fontSize: 9, color: C.dim, align: "left", margin: 0 });
  s.addText(`${n} / 15`, { x: 11.8, y: 7.1, w: 0.93, h: 0.28, fontFace: MONO, fontSize: 9, color: C.dim, align: "right", margin: 0 });
}
function bullets(s, x, y, w, items, size, gap) {
  s.addText(items.map((t) => ({ text: t, options: { bullet: { code: "2022", indent: 14 }, color: C.fg, breakLine: true, paraSpaceAfter: gap ?? 8 } })),
    { x, y, w, h: 4.6, fontFace: BODY, fontSize: size ?? 13.5, color: C.fg, align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.05 });
}
function note(s, n, who, text) {
  const full = `[${who}]\n\n${text}`;
  s.addNotes(full);
  NOTES.push([n, who, text]);
}

/* ════ Slide 1 — Title, promise, five members ════ */
let s = P.addSlide(); bg(s);
s.addText("AV", { x: 0.6, y: 0.5, w: 0.95, h: 0.78, fontFace: HEAD, fontSize: 28, bold: true, color: C.bg, align: "center", valign: "middle", fill: { color: C.amber }, margin: 0 });
s.addText("AutoValuate", { x: 0.6, y: 1.9, w: 12, h: 1.15, fontFace: HEAD, fontSize: 58, bold: true, color: C.fg, margin: 0 });
s.addText("Intelligence", { x: 0.6, y: 2.98, w: 12, h: 1.0, fontFace: HEAD, fontSize: 58, bold: true, color: C.amber, margin: 0 });
s.addText("Know what your car is really worth, with the reasoning shown, not hidden.", { x: 0.62, y: 4.1, w: 11.6, h: 0.55, fontFace: BODY, fontSize: 18, color: C.muted, margin: 0 });
s.addText("Computer vision + explainable ML + agentic RAG, live in production for the UAE used-car market.", { x: 0.62, y: 4.68, w: 12, h: 0.45, fontFace: BODY, fontSize: 13, color: C.dim, margin: 0 });
const members = ["Krishna Mathur", "Atharva Soundankar", "Yash Petkar", "Sarth Malankar", "Krish Kumar"];
members.forEach((m, i) => {
  const x = 0.6 + i * 2.46;
  s.addShape(P.ShapeType.roundRect, { x, y: 5.45, w: 2.3, h: 0.85, rectRadius: 0.08, fill: { color: C.surface }, line: { color: C.border, width: 1 } });
  s.addText(m, { x: x + 0.08, y: 5.45, w: 2.14, h: 0.85, align: "center", valign: "middle", fontFace: HEAD, fontSize: 12.5, bold: true, color: C.fg, margin: 0 });
});
s.addText("SP Jain School of Global Management  ·  Group Capstone  ·  Live product", { x: 0.62, y: 6.6, w: 12, h: 0.35, fontFace: MONO, fontSize: 10.5, color: C.dim, charSpacing: 1, margin: 0 });
note(s, 1, "Krishna Mathur",
`Good morning everyone. We're the AutoValuate team: myself, Atharva, Yash, Sarth and Krish. Over the next twenty minutes we want to show you something that actually runs, not a concept. AutoValuate tells you what a used car in the UAE is worth, and unlike every price checker we could find, it shows you the reasoning behind the number. You can open it on your phone right now, it's free, and every claim we make today traces back to a file in our repository.

One housekeeping note before we start. Everything in this deck was checked against the repository as it stood this morning. Repository version reviewed for this presentation: commit ${COMMIT}, reviewed on ${REVIEWED}. The screenshots you'll see were taken from the live deployment on the same day, so what you see here is what a user gets.

Let me set up the problem first, because the product only makes sense once you feel how one-sided this market is.`);

/* ════ Slide 2 — Executive overview & deployment status ════ */
s = P.addSlide(); bg(s); kicker(s, "Executive overview"); title(s, "A working product, deployed and free");
bullets(s, 0.6, 1.95, 6.6, [
  "Enter a car, optionally add photos. You get a priced range with the drivers shown, a damage read, market context and a written, citation-checked report.",
  "Fifteen result panels cover the full decision: value it, judge the deal, test assumptions, finance it, repair it, time the sale, negotiate it, list it.",
  "Runs entirely on free-tier infrastructure. No sign-up, no paid tiers.",
], 14, 10);
card(s, 7.5, 1.95, 5.2, 1.7, "Deployment status (verified today)", "Frontend on Vercel, API on Render, data on Supabase. Live at auto-valuate-intelligence.vercel.app. Weekly data refresh and CI gates run on GitHub Actions.", C.good);
stat(s, 7.5, 4.0, 2.6, "13.18%", "median pricing error, held-out folds");
stat(s, 10.2, 4.0, 2.6, "AED 0", "cost to the user");
stat(s, 7.5, 5.5, 2.6, "15", "result panels in the live app");
stat(s, 10.2, 5.5, 2.6, "142", "tests in the committed suite");
footer(s, 2);
note(s, 2, "Krishna Mathur",
`Here's the shape of the thing. You type in a car, add photos if you want, and the app gives you a price range, the reasons behind it, a damage assessment, live market context, and a report where every number is checked before you see it.

Two numbers on this slide matter most. The median pricing error is 13.18 percent, measured on held-out data, and I want to stress that we report the median honestly rather than quoting our best fold. And the cost to the user is zero. The whole stack runs on free tiers: Vercel for the frontend, Render for the API, Supabase for data.

The fifteen panels sound like a lot, but they follow one idea: a valuation alone doesn't finish the job. A seller still has to judge an offer, decide on repairs, write a listing, and negotiate. The product walks all the way to that finish line. And behind it sit 142 automated tests, which we'll come back to when we talk about engineering.`);

/* ════ Slide 3 — Problem, gap, users ════ */
s = P.addSlide(); bg(s); kicker(s, "The problem"); title(s, "The seller has a feeling. The dealer has the data.");
bullets(s, 0.6, 2.0, 6.4, [
  "Used-car pricing in the UAE is opaque. Sellers negotiate on a hunch against people who price cars all day.",
  "Existing checkers return one number with no reasoning, no damage awareness and no honesty about uncertainty.",
  "So the number can't be defended in a negotiation, which is where it's actually needed.",
], 14, 10);
card(s, 7.5, 2.0, 5.2, 1.55, "The gap", "Nobody gives a private seller an explainable, damage-aware, uncertainty-honest price they can argue with. That is the product.", C.amber);
card(s, 7.5, 3.75, 5.2, 2.5, "Who it serves",
  "Private sellers pricing a car before listing it.\nBuyers checking whether an ask is fair before viewing.\nSmall dealers valuing a fleet by CSV without a data team.\nDevelopers, through an open API with no key.", C.info);
footer(s, 3);
note(s, 3, "Krishna Mathur",
`The UAE used-car market is big and busy, and the information in it is lopsided. A dealer prices cars every single day. A private seller does it maybe once every four years, usually by looking at a few listings and guessing. When those two sit down together, one side has data and the other has a feeling.

The tools that exist don't fix this. They give you a single number and stop. No reasoning, no sense of how confident that number is, and nothing about the actual condition of your actual car. Try defending a number like that when a buyer pushes back. You can't, because you don't know where it came from either.

That's the gap we built for. Not a fancier number. A defensible one. Our users are the seller pricing before listing, the buyer sanity-checking an ask, the small dealer with a fleet spreadsheet, and developers who want the engine through an open API. With that framing, Atharva will walk you through what using it feels like.`);

/* ════ Slide 4 — Live user journey ════ */
s = P.addSlide(); bg(s); kicker(s, "The product, live"); title(s, "From car details to a defensible answer", 0.6, 0.74, 8);
shot(s, SH("01_hero.png"), 0.6, 1.85, 6.0, 4.45);
shot(s, SH("02_trace.png"), 6.9, 1.85, 5.8, 4.45);
s.addText("Details in (photos optional)  →  each agent streams its step live  →  valuation, decision tools, report and share.",
  { x: 0.6, y: 6.5, w: 12.1, h: 0.4, fontFace: BODY, fontSize: 12.5, color: C.muted, align: "center", margin: 0 });
footer(s, 4);
note(s, 4, "Atharva Soundankar",
`Thanks Krishna. This is the real app, photographed from the live site this morning.

The journey starts simple. You describe the car, or even type a sentence like "2019 Nissan Patrol, 120 thousand kilometres" and let the form fill itself. Photos are optional, and that's deliberate. If you add them, the damage scan runs on your own device. If you don't, the app says plainly that condition wasn't verified, and prices accordingly.

The right screenshot is the part people remember. While the system works, you watch each agent report in: intake, damage aggregation, the pricing model, comparable listings, report writing, then a verifier that checks every number in that report against computed evidence. It streams live. Nothing hides behind a spinner.

Why show the pipeline at all? Because trust is the product. If we're asking a seller to walk into a negotiation with our number, they deserve to see how it was made. The next two slides open up the two models doing the heavy lifting.`);

/* ════ Slide 5 — Explainable valuation ════ */
s = P.addSlide(); bg(s); kicker(s, "Engine 1 · pricing"); title(s, "An explainable price, with honest uncertainty", 0.6, 0.74, 8.6);
shot(s, SH("03_valuation_shap.png"), 0.6, 1.8, 6.8, 4.6);
stat(s, 7.8, 1.9, 2.5, "13.18%", "median APE, 5 seeds x 5 folds, held out");
stat(s, 10.4, 1.9, 2.4, "+52.3%", "vs a make and model median baseline");
stat(s, 7.8, 3.4, 2.5, "79%", "conformal interval coverage, target 80%");
stat(s, 10.4, 3.4, 2.4, "81%", "of cars matched to physical specs");
card(s, 7.8, 5.0, 4.95, 1.45, "How", "XGBoost on 1,302 real UAE listings, joined to vehicle specs (power, torque, weight). SHAP shows each factor's AED effect. Split-conformal bands, calibrated per tier.", C.info);
footer(s, 5);
note(s, 5, "Atharva Soundankar",
`The pricing engine is XGBoost trained on 1,302 real UAE listings. That's a modest corpus, and you'll hear us be honest about that later, but two decisions squeeze a lot out of it.

First, every car is joined to its physical specification: horsepower, torque, weight, fuel economy. We proved this join helps with a paired, permutation-controlled study before shipping it, and it took the median error from about fifteen and a half percent to 13.18. When we shuffled the specs as a control, the gain vanished, which is how you know it's signal and not leakage.

Second, we never give one number. The band around the estimate is split-conformal, calibrated separately for luxury and mass-market cars, and it keeps its promise: we target 80 percent coverage and measure 79 on held-out data.

The chart on the left is SHAP, which turns the model inside out. Mileage pulled this price down by so many dirhams, engine size pushed it up. That's what makes the number arguable in a real negotiation instead of a take-it-or-leave-it verdict.`);

/* ════ Slide 6 — Damage detection + capture coaching ════ */
s = P.addSlide(); bg(s); kicker(s, "Engine 2 · damage"); title(s, "Damage scanning on your device, coached at capture", 0.6, 0.74, 9.6);
shot(s, SH("04_damage.png"), 0.6, 1.8, 6.0, 4.55);
shot(s, SH("14_coaching.png"), 6.9, 1.8, 5.85, 3.1);
card(s, 6.9, 5.1, 5.85, 1.25, "New: capture coaching", "A 3.5 MB Apache-2.0 detector (YOLOX-Nano) checks each shot as it's taken: too far, cut off, blurry, too dark. Advice only. It never touches the score.", C.good);
footer(s, 6);
note(s, 6, "Atharva Soundankar",
`The damage model is a YOLOv8 detector we trained on around fourteen thousand images across eight damage classes, exported to ONNX and run inside the browser. Your photos never leave your device. That's not a checkbox for us, it's the reason the feature can be free: there's no GPU bill because the user's own hardware does the work.

Every finding carries provenance. The scan stamps which model version and which preprocessing produced it, and the backend refuses a condition report whose versions don't match what we ship. Nobody can forge a clean scan.

The right side is our newest addition, and it exists because we measured our own weakness. This detector was trained on close-up damage photos, so its output is sensitive to framing. We can't retrain it without more UAE photos, but we can stop bad photos at the source. So a small second model, deliberately Apache licensed and only three and a half megabytes, now checks every capture: too far away, car cut off, blurry, too dark. You get told while you're still standing next to the car. It advises, it never scores.`);

/* ════ Slide 7 — Decision intelligence (mandated three panels) ════ */
s = P.addSlide(); bg(s); kicker(s, "Decision intelligence"); title(s, "From fair value to a real purchase decision", 0.6, 0.74, 9.6);
s.addText("AutoValuate now helps users judge the deal, test assumptions and understand financing affordability.",
  { x: 0.6, y: 1.42, w: 12.1, h: 0.35, fontFace: BODY, fontSize: 13, color: C.muted, margin: 0 });
shot(s, SH("05_deal_score.png"), 0.6, 2.0, 3.95, 3.35);
shot(s, SH("06_whatif.png"), 4.7, 2.0, 3.95, 3.35);
shot(s, SH("07_financing.png"), 8.8, 2.0, 3.95, 3.35);
s.addText("Is the asking price attractive?", { x: 0.6, y: 5.45, w: 3.95, h: 0.35, align: "center", fontFace: HEAD, fontSize: 12, bold: true, color: C.amber, margin: 0 });
s.addText("What assumptions change the value?", { x: 4.7, y: 5.45, w: 3.95, h: 0.35, align: "center", fontFace: HEAD, fontSize: 12, bold: true, color: C.amber, margin: 0 });
s.addText("What does it cost each month?", { x: 8.8, y: 5.45, w: 3.95, h: 0.35, align: "center", fontFace: HEAD, fontSize: 12, bold: true, color: C.amber, margin: 0 });
s.addText("Indicative estimates, not offers or advice. A correctly valued car can still be unaffordable for a given buyer, so value and affordability stay separate on purpose.",
  { x: 0.6, y: 5.95, w: 12.1, h: 0.55, fontFace: BODY, fontSize: 11, italic: true, color: C.dim, align: "center", margin: 0 });
footer(s, 7);
note(s, 7, "Yash Petkar",
`Thanks Atharva. A valuation answers one question: what is this car worth? Real decisions need three more, and that's this slide.

The deal score, on the left, takes an asking price the user types in and places it against the model's fair-value range. In this live example someone asks 105 thousand for a Patrol the model values at 92, and the card says so: 29 out of 100, above fair value. One important design choice: the asking price never enters the pricing model. It would only teach the model to agree with the seller.

The middle panel is the what-if explorer. Drag mileage, year or condition and watch the price re-compute against the live model. Those what-if conditions are clearly synthetic, never confused with a real photo scan.

The right panel is the financing estimator, and it has a genuinely local insight. UAE banks advertise flat rates, where interest is charged on the whole principal for the whole term. A three percent flat quote is really about five point six percent in APR terms, and this card shows both. It also warns below a twenty percent down payment, because Central Bank Regulation 29 of 2011 caps car finance at eighty percent of vehicle value. Indicative only, of course. Not an offer, and it knows nothing about a person's salary or eligibility.`);

/* ════ Slide 8 — Ownership & selling decisions ════ */
s = P.addSlide(); bg(s); kicker(s, "Own it or sell it"); title(s, "Repair, depreciation and when to sell", 0.6, 0.74, 9);
shot(s, SH("08_repair.png"), 0.6, 1.85, 4.0, 4.35);
shot(s, SH("10_depreciation.png"), 4.75, 1.85, 4.0, 4.35);
shot(s, SH("10b_forecast.png"), 8.9, 1.85, 3.85, 4.35);
footer(s, 8);
note(s, 8, "Yash Petkar",
`These three panels answer the questions that come after the price.

Repair first. When the scan finds damage, the app maps each finding to an indicative UAE workshop cost range, scaled by severity. Then it does the comparison that actually matters: this damage is costing you roughly this much in value, against a repair bill of roughly that much. When fixing before selling pays for itself, it says so. These are published workshop ranges, not quotes, and the card says that too.

The middle chart is depreciation drawn from live listings: every dot is a real car of this model at some age, with your car placed on the curve. It uses asking prices, not sale prices, and the caption admits that, because sellers usually settle below ask.

The right panel projects your specific car forward through the pricing model itself: what does the model think this car is worth at one, two, three more years of age and mileage? That turns "should I sell now or hold" from a gut feeling into a curve you can look at. A projection, clearly labelled, never a guarantee.`);

/* ════ Slide 9 — Market grounding ════ */
s = P.addSlide(); bg(s); kicker(s, "Market grounding"); title(s, "Priced against a live market, not a static table", 0.6, 0.74, 9.6);
shot(s, SH("09_market.png"), 0.6, 1.85, 7.4, 4.5);
stat(s, 8.35, 1.95, 2.4, "1,307", "live UAE listings in the corpus");
stat(s, 10.85, 1.95, 1.9, "P@5 1.0", "same-make retrieval precision");
card(s, 8.35, 3.5, 4.4, 2.85, "Kept honest",
  "The corpus refreshes weekly through a scheduled scrape with a hard budget cap.\n\nWhen a model is too rare to chart, the analytics card says the corpus is thin instead of drawing a misleading graph. Growing data is the fix, and the card says that too.", C.info);
footer(s, 9);
note(s, 9, "Yash Petkar",
`Everything you've seen is anchored to a live corpus of about thirteen hundred UAE listings, refreshed every week by a scheduled scrape with a hard budget cap so it can never blow through the free tier.

The analytics view places your car among its comparables: price against mileage, your estimate in the middle, and your market percentile. In the seller report those same comparables appear with citations, so when the app claims a similar Patrol listed at 116 thousand, you can check that claim.

The part I most want you to notice is what happens when data is missing. Ask for a rare model and the card does not quietly draw a chart out of two points. It tells you the corpus is thin for this car and that the valuation is leaning on the model rather than comparables. We think refusing to fake a chart is a feature. Thirteen hundred listings is honestly small, it's the biggest limit on our accuracy, and the weekly pipeline exists precisely to grow it. Sarth will take you from here to what the user walks away with.`);

/* ════ Slide 10 — Actionable outputs ════ */
s = P.addSlide(); bg(s); kicker(s, "Actionable outputs"); title(s, "The report, the negotiation and the listing", 0.6, 0.74, 9.6);
shot(s, SH("11_report.png"), 0.6, 1.85, 4.55, 4.35);
shot(s, SH("12_negotiation.png"), 5.3, 1.85, 3.7, 4.35);
shot(s, SH("13_listing.png"), 9.15, 1.85, 3.6, 4.35);
footer(s, 10);
note(s, 10, "Sarth Malankar",
`Thanks Yash. This is where the product earns its keep, because analysis nobody acts on is trivia.

The seller report on the left is written by a language model but kept on a very short leash. It may only use figures from the computed evidence pack, every number carries a citation, and a deterministic verifier re-checks the whole thing before display. In this example, twelve numbers and sixteen citations, all traced. If the language model invents anything, the report is rejected and a deterministic writer takes over. The same discipline runs the grounded assistant: ask it anything about your valuation and an answer with an unverifiable number never reaches you.

The negotiation coach turns the evidence into talking points: open here, hold above this, here's the comparable to cite, disclose the dent before they find it. Sell mode and buy mode argue opposite sides of the same facts.

The listing pack writes the ad itself, damage disclosed on purpose. And everything sends. One tap shares the script or listing through your phone's share sheet, WhatsApp first, because that's where UAE car deals actually happen. There's also a public share link, a PDF and a certificate.`);

/* ════ Slide 11 — Architecture ════ */
s = P.addSlide(); bg(s); kicker(s, "Under the hood"); title(s, "End-to-end architecture on free tiers", 0.6, 0.74, 9.6);
const arch = [
  ["Browser", "Next.js UI. Damage scan + capture coach run here in ONNX, photos never leave the device.", C.amber],
  ["Vercel", "Hosts the frontend. Deploys from main on every push.", C.info],
  ["FastAPI on Render", "LangGraph pipeline: intake, aggregate, value, retrieve, report, verify, disclose.", C.info],
  ["Models", "XGBoost bundle with baked-in spec table. YOLOv8 damage ONNX. YOLOX coach ONNX.", C.good],
  ["Supabase", "Comparables with pgvector retrieval, public share links.", C.info],
  ["GitHub Actions", "CI gates, weekly corpus scrape, keep-alive crons.", C.muted],
];
arch.forEach((a, i) => {
  const col = i % 3, row = Math.floor(i / 3);
  const x = 0.6 + col * 4.18, y = 1.95 + row * 2.3;
  card(s, x, y, 3.95, 2.05, a[0], a[1], a[2]);
});
s.addText("Provenance everywhere: model hashes, preprocessing versions and config versions travel with every scan, and the backend rejects mismatches.",
  { x: 0.6, y: 6.45, w: 12.1, h: 0.4, fontFace: BODY, fontSize: 11.5, italic: true, color: C.dim, align: "center", margin: 0 });
footer(s, 11);
note(s, 11, "Sarth Malankar",
`Here's how it hangs together. The browser does more work than usual in this architecture: both vision models run there in ONNX, which is what keeps photos private and inference free. The frontend lives on Vercel and redeploys from the main branch on every push.

The backend is FastAPI on Render running a LangGraph pipeline, seven steps from intake to confidence disclosure. Each step is a small agent with one job, which made the system much easier to test than one big function. The pricing model ships as a bundle with its spec table baked in, so inference never needs the raw spec file. Supabase holds the comparables with vector retrieval, plus the public share links. GitHub Actions runs continuous integration, the weekly corpus scrape, and the keep-alive pings that stop free-tier services from sleeping.

One thread stitches all of it together: provenance. Every scan carries the hash of the model that produced it and the version of the preprocessing it ran through. The backend checks those stamps and refuses what it doesn't recognise. On free infrastructure, that discipline is what makes the results trustworthy.`);

/* ════ Slide 12 — Data, training, MLOps, safeguards ════ */
s = P.addSlide(); bg(s); kicker(s, "Engineering discipline"); title(s, "Tested like a product, not a notebook", 0.6, 0.74, 9.6);
bullets(s, 0.6, 1.95, 6.5, [
  "142 committed tests: 72 backend, 70 frontend, run in CI on every push.",
  "Browser and backend score identically on 56 of 56 pinned fixtures, so the user's score can't drift from the server's.",
  "Same photo, same score, proven: the scan is bit-deterministic after we replaced GPU canvas resampling with pure JS.",
  "Every feature shipped behind a measured study. The spec join carried a permutation control. Rejected ideas are documented so nobody retries them.",
], 13.5, 9);
card(s, 7.5, 1.95, 5.25, 2.1, "Retraining, reproducible", "Training reads the committed corpus, so a fresh clone rebuilds the shipped artefact. Metrics JSONs regenerate with it, and the model card page renders those files directly. No number is typed by hand.", C.good);
card(s, 7.5, 4.25, 5.25, 2.1, "Safeguards in production", "Per-IP rate limiting on an open API. Photo size caps. Provenance rejection of forged scans. A verifier gate in front of every report. Honest fallbacks when the API is cold.", C.amber);
footer(s, 12);
note(s, 12, "Sarth Malankar",
`Two engineering habits define this project. The first is that nothing ships on a feeling. When we believed joining vehicle specs would help pricing, we ran a paired study with a permutation control before wiring it in. When an idea failed, and several did, we wrote down why, so future us doesn't retry it. Our repo has a findings file whose main content is fixes we tried and rejected with measurements attached.

The second habit is treating determinism as a feature. Early on, the same photo could produce different scores on different runs, and we traced it to GPU canvas resampling being non-deterministic. We replaced it with pure JavaScript pixel math and pinned it with tests. Same bytes, same score, every time. And because the browser computes the score users see, we hold a parity suite proving browser and backend agree on all fifty-six pinned cases.

All of it, 142 tests, runs in CI on every push. Training is reproducible from the committed corpus, and the public model card renders the generated metrics files directly, so no number on that page was ever typed by hand. Krish will now show you what those numbers actually say, including the unflattering ones.`);

/* ════ Slide 13 — Evaluation & honest limitations ════ */
s = P.addSlide(); bg(s); kicker(s, "Evaluation"); title(s, "Published like a scorecard, failures included", 0.6, 0.74, 9.6);
shot(s, SH("15_model_card.png"), 0.6, 1.85, 6.55, 4.5);
stat(s, 7.5, 1.9, 2.6, "1.000", "report faithfulness; corrupted control scores 0.00");
stat(s, 10.2, 1.9, 2.5, "1.3pp", "mean gap, promised vs delivered coverage");
card(s, 7.5, 3.45, 5.25, 2.9, "What we say out loud",
  "The 0.732 detector mAP came from a validation subset covering 6 of 8 classes. We publish it with that caveat, not as a headline.\n\nThe detector is framing-sensitive: a small crop can move the condition score by tens of points. Diagnosed, documented, and mitigated by capture coaching until a retrain on real UAE photos.\n\nPricing floor is data-bound: our learning curve says the current corpus supports ~13%, not the ~8% larger markets reach.", C.bad);
footer(s, 13);
note(s, 13, "Krish Kumar",
`Thanks Sarth. This is our model card. It's a public page in the product, and its rule is simple: every metric a user might care about, including the ones that embarrass us.

Some results we're proud of. Report faithfulness scores a perfect one, and we know the metric isn't a rubber stamp because we feed it a deliberately corrupted report as a control and that scores zero. The confidence intervals keep their promise within about one percentage point across every level we test.

Now the honest part. Our damage detector's headline accuracy, 0.732, was measured on a validation subset covering six of the eight classes, and we say so right on the page. Worse, we discovered the detector is sensitive to how a photo is framed: a small crop can swing the condition score by tens of points. We wrote the diagnosis down, shipped capture coaching as mitigation, and prepared a retraining notebook that waits on one thing we cannot conjure: labelled photos of whole cars in UAE conditions.

And pricing has a floor. Our own learning curve says this corpus size supports about thirteen percent error. Reaching eight needs thousands more listings, which is why the weekly pipeline matters more than any tuning.`);

/* ════ Slide 14 — Surfaces, licensing, roadmap ════ */
s = P.addSlide(); bg(s); kicker(s, "Beyond one valuation"); title(s, "Product surfaces and the path from here", 0.6, 0.74, 9.6);
shot(s, SH("16_dealer.png"), 0.6, 1.85, 5.6, 4.1);
card(s, 6.45, 1.85, 6.3, 1.5, "Four surfaces today", "Compare up to four cars as a buyer. Bulk fleet valuation by CSV for dealers. An open developer API, no key needed. The public model card you just saw.", C.info);
card(s, 6.45, 3.5, 6.3, 1.35, "Licensing, stated plainly", "The damage model derives from AGPL-3.0 YOLOv8, so closed-source resale needs an enterprise licence or a detector swap. Every new component since is deliberately Apache-2.0.", C.amber);
card(s, 6.45, 5.0, 6.3, 1.35, "Next", "Retrain the detector on labelled UAE whole-car photos. Grow the corpus past 5,000 listings. Arabic interface. Real pilot users.", C.good);
footer(s, 14);
note(s, 14, "Krish Kumar",
`Beyond the single valuation there are four surfaces. A buyer can compare up to four cars side by side and see which is genuinely the better deal, not just the cheaper sticker. A small dealer can upload a CSV and get the fleet valued in one pass; the screenshot shows three cars valued together. Developers get the same engine through an open API with no key, and the model card keeps us honest in public.

On commercial reality, we'd rather state it than have you find it. Our damage model derives from YOLOv8, which is AGPL licensed. That means selling this as closed-source software would need either Ultralytics' commercial licence or swapping the detector. It's why the product is free today, and why every component we've added since, like the capture coach, is deliberately Apache licensed. The problem stays contained instead of growing.

The road from here has three stones: retrain the detector on real UAE photos, which fixes our biggest weakness at the root. Grow the corpus toward five thousand listings, which our learning curve says buys real accuracy. And an Arabic interface, because a UAE product without one leaves out half its market.

On contributions: this was genuinely joint work across the five of us, spanning the detector, the pricing model, the agent backend, the frontend and the evaluation harness.`);

/* ════ Slide 15 — Close ════ */
s = P.addSlide(); bg(s);
kicker(s, "Close", 0.6, 0.6);
s.addText("An honest number you can argue with.", { x: 0.6, y: 1.15, w: 12.1, h: 1.6, fontFace: HEAD, fontSize: 40, bold: true, color: C.fg, margin: 0 });
s.addText("Live product. Real models. Every claim traceable to a committed artefact.", { x: 0.62, y: 2.75, w: 12, h: 0.5, fontFace: BODY, fontSize: 16, color: C.muted, margin: 0 });
shot(s, SH("qr_app.png"), 2.4, 3.6, 2.2, 2.2);
s.addText("Try it now", { x: 2.4, y: 5.9, w: 2.2, h: 0.3, align: "center", fontFace: HEAD, fontSize: 12, bold: true, color: C.amber, margin: 0 });
s.addText("auto-valuate-intelligence.vercel.app", { x: 1.4, y: 6.2, w: 4.2, h: 0.3, align: "center", fontFace: MONO, fontSize: 9.5, color: C.dim, margin: 0 });
shot(s, SH("qr_repo.png"), 8.7, 3.6, 2.2, 2.2);
s.addText("Read the code", { x: 8.7, y: 5.9, w: 2.2, h: 0.3, align: "center", fontFace: HEAD, fontSize: 12, bold: true, color: C.amber, margin: 0 });
s.addText("github.com/krish2105/AutoValuate-Intelligence", { x: 7.5, y: 6.2, w: 4.6, h: 0.3, align: "center", fontFace: MONO, fontSize: 9.5, color: C.dim, margin: 0 });
s.addText(`Product status and features verified against repository commit ${COMMIT_SHORT}, ${REVIEWED}.`,
  { x: 0.6, y: 6.95, w: 12.1, h: 0.3, fontFace: MONO, fontSize: 9, color: C.dim, align: "center", margin: 0 });
note(s, 15, "Krish Kumar",
`So that's AutoValuate. A seller walks in with a feeling and walks out with a number they can defend: here's the price, here's why, here's what the damage does to it, here's the comparable to cite, and here's the message to send.

Everything you saw today is live. The left code opens the product; it's free and there's no sign-up, so you can price a car before we finish taking questions. The right one opens the repository, where every metric we quoted today exists as a committed file you can regenerate yourself. This deck was verified against commit ${COMMIT_SHORT} as of this morning, and that's printed at the bottom so there's no ambiguity about which version we presented.

We'd rather show you than tell you, so we'll finish with a live demo. And we're happy to take the hard questions, including the ones about what doesn't work yet. We wrote those down too. Thank you.`);

/* ── emit ── */
P.writeFile({ fileName: path.join(__dirname, "AutoValuate_Deck_v3.pptx") }).then(() => {
  const md = [
    "# AutoValuate Intelligence: presentation script (v3, ~20 minutes, 15 slides)",
    "",
    `*Five presenters, three slides each. Verified against repository commit \`${COMMIT_SHORT}\` (${COMMIT}), reviewed ${REVIEWED}. The same text lives in each slide's speaker notes.*`,
    "",
    ...NOTES.flatMap(([n, who, text]) => [`## Slide ${n}: ${who}`, "", text, ""]),
  ].join("\n");
  fs.writeFileSync(path.join(__dirname, "AutoValuate_Script_v3.md"), md);
  console.log("wrote AutoValuate_Deck_v3.pptx + AutoValuate_Script_v3.md");
});
