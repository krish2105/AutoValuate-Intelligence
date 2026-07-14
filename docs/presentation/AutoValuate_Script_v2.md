# AutoValuate Intelligence — Presentation Script (15 minutes, 13 slides)

*A spoken script for a four-person group presentation. First person, natural — written to
sound like real people talking, not like a paper. Read it out loud once before you present.
Presenter cues are in italics. Total budget ~15:00, including a ~90-second live demo on
slide 4.*

**Speaker split (4 members):**
- **Krishna Mathur (AS25DXB018)** — slides 1, 2, 6 (open, team, the computer-vision / deep-learning story)
- **Yash Petkar (AS25DXB020)** — slides 4, 5, 7 (the live demo, explainable pricing, repair & forecast)
- **Atharva Soundankar (AS25DXB021)** — slides 8, 9, 10 (market analytics, the agentic trust layer, architecture)
- **[ Fourth member ] (AS25DXB0__)** — slides 3, 11, 12, 13 (problem & market, business model, evaluation, the verdict)

*Handoffs are marked. Whoever isn't speaking should be driving the laptop for the person who is.*

---

## Slide 1 — Title  *(~0:45) — Krishna*

*(Stay on the title slide. Don't rush the open.)*

A few months ago a friend of mine was selling his Corolla. Looked-after car, full service history. He took it to a dealer, and the dealer offered him about eight thousand dirhams under what it was actually worth. And here's the thing — my friend had no way to argue back. He didn't have a number. He just had a feeling. And a feeling loses every single time against someone who does this all day.

That's the reason we built this. It's called **AutoValuate Intelligence**. You give it photos of your car and a few details, and it gives you a fair price you can actually defend — with the reasoning shown, not hidden. And everything you're about to see is a real, running system. Not a mockup.

*(Handoff:)* Let me quickly introduce the team.

---

## Slide 2 — The team  *(~0:35) — Krishna*

There are four of us. I'm Krishna — I worked on the deep-learning side, the damage detector. Yash owned the valuation model, the data, and a huge amount of the live product build. Atharva built the agentic backend and the retrieval layer. And our fourth member led the frontend and product experience.

The honest truth is all four of us touched every layer of this — but those were our anchors.

*(Handoff to the fourth member for the problem.)*

---

## Slide 3 — The problem & the market  *(~1:05) — Fourth member*

So let's talk about why this is a real problem and not just a class project.

The UAE turns over roughly **one and a half million** used cars a year, and pricing is genuinely opaque. The seller is working off a hunch; the dealer does this professionally and wins every negotiation. On average that asymmetry costs the seller something like eight thousand dirhams per car.

And the tools that exist don't fix it. They hand you one number. No reasoning. No awareness of whether the car is damaged. And no honesty about how uncertain that number actually is. *(Gesture to the stats.)* So the question "how much is my car worth, and can I defend that?" — for a normal person, today, there's no trustworthy free answer to that. That gap is the whole opportunity.

*(Handoff to Yash for the demo.)*

---

## Slide 4 — The product, live  *(~1:40, includes demo) — Yash*

*(This is the live demo. Have the site already open in another tab so you can switch fast. If the network is unreliable, the "demo garage" sample cars run instantly, even offline — use those.)*

So this is it, running. *(Switch to the live site.)* I'll pick our accident-repaired sample SUV so you can see the full pipeline. I hit value… and watch the left side — that's the reasoning trace, each step of the pipeline reporting as it happens. That's not a loading spinner, that's the actual agents running.

And there's the result. A fair-market value, a confidence range, and — this is the important part — *why*. Every panel you're seeing is generated live. Photos, by the way, never leave the browser; I'll come back to why that matters.

*(Switch back to the slide.)* Four things happen here: your car gets scanned for damage on your own device, an explainable model prices it, we pull live comparable listings, and we write a report where every number is traceable. All of it on free infrastructure. Let me show you the pricing.

---

## Slide 5 — Explainable pricing  *(~1:05) — Yash*

*(On the SHAP screenshot.)*

Most tools give you a number and stop. We think the number is the least interesting part — what matters is *why*.

This is a technique called SHAP. It shows exactly how each feature moved the price, in dirhams. So here you can literally see: the engine size pushed it down this much, the model pushed it up this much, mileage took this off. If you're negotiating, this is your ammunition — you're not saying "I feel it's worth more," you're saying "here's the breakdown."

And on the right — we don't pretend to be more certain than we are. That range is a *calibrated* eighty-percent confidence interval. I'll come back to what "calibrated" really means later, because we tested it, and the result genuinely surprised us. For now: it's an honest range, not false precision.

*(Handoff to Krishna for the computer vision.)*

---

## Slide 6 — On-device computer vision  *(~1:25) — Krishna*

This is the part I'm most proud of. The damage detector.

It's a YOLOv8 model, fine-tuned on about eighteen thousand real images across two datasets, detecting eight types of damage — dents, scratches, cracked glass, broken lamps, and so on. On our held-out test set it scores an mAP of **0.732**. I want to be clear that's a real number that we're reporting honestly — not rounded up, not cherry-picked.

But here's the design decision I really want you to notice. We exported the model to a format called ONNX and we run it **in the browser**, using onnxruntime-web. *(Let that land.)* That means your photos never get uploaded anywhere — the scan happens on your own phone. That's a genuine privacy guarantee, not a privacy policy.

And it has a second benefit that's almost more important for a startup: it makes computer vision *free at any scale*. There's no server GPU, no per-image cost. A million users scanning their cars costs us nothing extra. Whatever damage it finds flows straight into the price you just saw.

*(Handoff to Yash for repair and forecast.)*

---

## Slide 7 — From detection to decision  *(~1:05) — Yash*

Detecting damage is nice. But the question a seller actually has is: *does this cost me money, and should I fix it before I sell?*

So on the left — the repair estimate. We take each piece of damage the detector found, and turn it into an itemised cost, using published UAE workshop price ranges scaled by how severe the detector thinks the damage is. And then we do the maths a person actually cares about: this damage is costing you roughly eight-seven-sixty in value, against a repair bill of about six-two-thirty — so yes, fixing it before you sell probably pays for itself.

On the right — timing. When should you sell? We don't invent a depreciation rate. We take *this exact car* and re-run our own pricing model on it aged forward a year, two years, three. So that curve is the model's real view of how this car loses value — and it carries the same honest error bars as everything else.

*(Handoff to Atharva for market context.)*

---

## Slide 8 — Market analytics  *(~0:55) — Atharva*

A price with no context is just an opinion. So we put your car into the real market.

This scatter plots your car against live comparable listings we actually retrieved from the market, and the shaded band is the model's fair-value range — so you can see instantly whether you're sitting high or low. The gauge turns that into a percentile: "you're priced higher than eighty percent of comparable cars." And the bar chart is your estimate against each individual comparable.

Small but important detail — every one of these charts is fully responsive, and renders properly in both light and dark mode. We actually tested that on real phones, because a chart that breaks on mobile is a chart nobody trusts.

---

## Slide 9 — The agentic trust layer  *(~1:20) — Atharva*

Now — this is the slide I'd stop on if you remember one thing from today.

The moment you let a language model write a valuation report, you have a problem: language models make up numbers. Confidently. So we built a guard against exactly that. It's called the **Verifier**.

Every single number in the written report *and* in the chat assistant is checked, deterministically, against the evidence the pipeline actually computed. If the model writes a price that doesn't trace back to a real computed value, the Verifier rejects it — before you ever see it. We measured this: report faithfulness is **1.000**. And we tested it adversarially — we forced the model to invent a price, and the system caught it and refused, every time.

*(On the assistant screenshot.)* So you can ask it questions — "is this a good deal?" — and it answers grounded, with citations, and it literally *cannot* quote a number it didn't compute. For a financial product, that's the difference between a toy and something you'd trust.

---

## Slide 10 — Architecture  *(~1:05) — Atharva*

Quickly, under the hood, so you can see it's a real system.

Five stages. Intake validates the car. The vision model runs — that's the on-device CV. The pricing model is gradient-boosted trees doing quantile regression, with the conformal calibration and SHAP on top. Then retrieval — a hybrid of semantic embeddings, keyword search, and a structured similarity that understands what "comparable" means for a car. And finally the report, written by a language model but held to the evidence by the Verifier.

*(Gesture at the terminology line.)* Everything on that bottom row is deep-learning and ML we actually applied — object detection, transfer learning, ONNX quantization, conformal prediction, SHAP, embeddings, reranking, retrieval-augmented generation. And the entire stack — frontend, backend, database, training, CI — runs on **free tiers**. Nothing here costs us money to operate.

*(Handoff to the fourth member for business and close.)*

---

## Slide 11 — Business model  *(~1:05) — Fourth member*

So how does this become a business?

The trick is that on-device computer vision I mentioned — because the expensive part runs on the user's phone, the core product is basically free for us to run. So we give it away. Sellers pay nothing, forever. *(Gesture across the three screenshots.)*

We monetise the things businesses will actually pay for. Dealers value their whole inventory at once with bulk CSV upload — that's a real workflow they do daily. Developers get a metered API with proper key management. And there's a clean Free / Pro / Dealer tier structure with white-label reports. All of this is built — it's on the screen.

And the principle we held to: every tier runs the *same model* and the *same Verifier*. Paying more buys you volume and workflow. It never buys you a different answer. That's deliberate.

---

## Slide 12 — Evaluation & honesty  *(~1:15) — Fourth member*

I want to spend a moment on evaluation, because this is where we're proudest, and it's a bit unusual.

*(Gesture to the stats.)* CV at 0.732, reported honestly. Report faithfulness a perfect 1.000. Conformal coverage hitting its eighty-percent target exactly. Zero accessibility violations across the whole app.

But the two findings I really want to share both *argued against the obvious choice*. First — uncertainty. The natural thing to ship is raw quantile regression; it promises eighty-percent coverage. We measured it: it actually delivers **fifty-four**. And the industry "give or take twenty-five percent" rule of thumb? Fifty-six percent — and it looks reassuringly tight *precisely because it's wrong*. Only the calibrated method keeps its promise. Without that, this product would be confidently wrong in a way no user could ever detect.

Second — our retrieval. We tried to tune it and discovered we couldn't improve it, because we proved it's already at its mathematical ceiling: our benchmark's maximum possible score is 0.78, and it scores exactly 0.78. The limit isn't our algorithm, it's that some cars simply have no comparable listings yet. That's an honest, useful thing to know — it tells us the one lever that matters is growing the data, which we've automated.

The point is: we measured, and we reported what we found, even when it was uncomfortable.

---

## Slide 13 — The verdict & close  *(~0:55) — Fourth member*

So where does this leave us.

*(Gesture to the 90.)* As a capstone product, we'd genuinely score this around ninety out of a hundred — it's live, it's deep, it's honestly evaluated. Is it a real MVP? Yes, unambiguously — a stranger can go to the URL right now, value a car, see the reasoning, and walk away with a number they can defend. And as a SaaS, we're around seventy-two out of a hundred: the auth, the API, metering, plans, dealer tools are all built; what's left is real payments, a bigger dataset, and scaling the vision service.

And we're not hiding the gaps — the thin corpus, the test-mode payments, the single region. They're named, right there on the slide, because the whole spirit of this project was honesty over hype.

Everything we showed you is live, free, and reproducible — even our metrics page is public.

Thank you. We'd love your questions.

---

*Reference: strategy in `ROADMAP.md`, system design in `ARCHITECTURE.md`, the experiments in `RESEARCH.md`, and the full build history in `REMAINING_IMPLEMENTATION_PLAN.md`.*
