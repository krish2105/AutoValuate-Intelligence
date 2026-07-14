# AutoValuate Intelligence — Presentation Script (15 minutes)

*Spoken script for a group presentation. First person, natural, ~15 minutes with the live demo. One section per slide (19 slides). Presenter cues in italics. It's written to sound like real people talking, not like a paper — read it out loud once before you present.*

**Suggested speaker split (4 members):**
- **Speaker A** — slides 1–6 (hook, team, problem, market, why-existing, solution)
- **Speaker B** — slides 7–10 (live demo, architecture, the CV / deep-learning story)
- **Speaker C** — slides 11–13 (valuation ML, agentic layer, responsible AI)
- **Speaker D** — slides 14–19 (business model, stack, evaluation, limitations, roadmap, close)

Handoff points are marked. Total budget ~15:00 including a ~90-second live demo.

---

## Slide 1 — Title *(~0:50) — Speaker A*

*(Stay on the title slide. Don't rush.)*

So a few months back a friend of mine was selling his Corolla. Good car, looked after it, full service history. He took it to a dealer, and the guy offered him about eight thousand dirhams less than what it was actually worth. And the thing is, my friend had no way to argue. He didn't have a number. He just had a feeling, and a feeling loses every time against a dealer who does this all day.

That moment is the whole reason we built this. It's called AutoValuate Intelligence. You give it photos of your car and a few details, and it gives you a fair price you can actually defend — with the reasoning shown, not hidden. Everything we show you today is a real, running system.

---

## Slide 2 — The team *(~0:40) — Speaker A*

Quick introductions first, because this was a real team effort.

*(Gesture across the cards.)* I'm [name], and I worked mostly on the deep-learning side, the damage detector. Yash focused on the valuation model and the data. Atharva built the agentic backend and the orchestration. And [fourth member] owned the frontend and the product side. The truth is all four of us touched every part of it, but those were our anchors.

---

## Slide 3 — The problem *(~0:50) — Speaker A*

Let me set the scene, because this isn't a niche problem.

*(Pause on the twenty-billion figure.)* The used-car market in the UAE is heading toward twenty billion dollars by 2026. It's huge, and it's still growing. And yet the way people actually price cars in it hasn't really moved.

Three things go wrong. Dealers quote low, because their profit depends on buying cheap — that's just their incentive. Classified sites don't save you either, because they show you what people are *asking*, not what cars actually *sold* for, so you anchor way too high and then wonder why nobody calls. And damage is pure guesswork on both sides. Someone sees a dent, knocks off whatever feels right. Nobody can tell you what that specific dent, on a car with this mileage, actually costs.

---

## Slide 4 — Market opportunity *(~0:50) — Speaker A*

And it's a good market to go after, for a few reasons.

*(Point at the three stats.)* Used-car sales here run well ahead of new-car sales, so resale is actually the bigger game. It's a high-churn market — a lot of expats, people arriving and leaving, cars changing hands fast and often. And the buying journey has moved online. People start on their phone now, which means an instant, trustworthy price isn't a nice-to-have anymore, it's becoming the expectation.

*(Slow down for the "why now".)* So the opening is this: a verified, damage-aware estimate that anyone can generate in seconds and actually defend with evidence. That's the wedge we're going for.

---

## Slide 5 — Why existing tools fall short *(~0:50) — Speaker A*

Now, there are players in this space — the instant-offer sites, the classifieds, a few valuation tools. Sell Any Car, dubizzle, CarSwitch, Seez, dubicars, and so on. And they each solve a piece of it.

But here's the gap. *(Walk the three columns.)* To do this properly you need three things at the same time. You need to actually *see* the damage. You need to *explain* how you got to the price. And you need to *back it up* with real listings. Every one of these exists somewhere. Not one consumer tool puts all three in a single report and ties every number back to the model that produced it. That's the space we went after.

*(Handoff.)* And the easiest way to show you is to just show you. I'll hand over to [Speaker B].

---

## Slide 6 — The solution in one picture *(~0:40) — Speaker B*

Thanks. Here's the whole thing in one line. Photos and details go in. A trustworthy, explained number comes out.

The part I want you to hold onto is what's in the middle. *(Point.)* It's not one AI model waving its hands. It's three separate systems: a computer-vision model that's actually trained to spot damage, a pricing model that can show its work, and a retrieval layer that pulls up real comparable cars. Three specialists, not one generalist guessing.

---

## Slide 7 — Live demo *(~1:20 including the demo) — Speaker B*

Okay. Let me stop describing it and show you the real thing.

*(Switch to the live app. Fill in a real car — a Toyota Corolla, 2019, ninety thousand kilometres — and hit "Value my car".)*

Watch the left side here. Each step lights up as it happens — intake, then the damage check, then pricing, then it pulls comparables, writes the report, and verifies it. That's the actual system thinking, streamed to you live, not a loading spinner pretending.

*(Let the results build. Point at the price range and the chart.)* And there's the answer. A price range, the exact factors behind it, comparable cars you can click through to, and a plain-English write-up. One thing I want to stress — every number on this screen reproduces from our test suite. One command, and you can check all of it yourself.

---

## Slide 8 — System architecture *(~0:55) — Speaker B*

*(Back to the deck.)* This is what's under the hood, and I want to be honest about why it's built this way.

At the top is the app you just saw, on Vercel. It talks to an orchestration API on Render, and that API runs those seven steps as a state machine. Underneath sit the three brains: the damage detector on Hugging Face, the price model running inside the API, and the comparables search over a vector database.

Here's the point I'd make to a technical audience. This is a genuine hybrid. There's a trained deep-learning model, there's a classical machine-learning model, and there's an agentic layer wrapped around both. It is not a chatbot with a nice coat of paint.

---

## Slide 9 — Deep learning: the damage detector *(~0:55) — Speaker B*

Let's take the three brains one at a time, starting with the vision model.

We trained it on about eighteen thousand real, human-annotated photos of damaged cars, from two public datasets called CarDD and VehiDE. We merged them into one set with eight kinds of damage — dents, scratches, cracks, shattered glass, broken lamps, and so on.

We used a model called YOLOv8, and we deliberately chose *detection* over plain *classification*. That difference matters for money. Knowing a car is damaged isn't enough — a crack in the windshield costs very differently from a scratch on a bumper. So the model has to find *where* the damage is, not just *whether* it exists.

---

## Slide 10 — CV results *(~0:55) — Speaker B*

Now this is the slide where we could have shown you an impressive accuracy number. We're not going to, and I want to explain why.

*(Pause. Be direct.)* The detector is still finishing its training run, on Kaggle's free GPU. So the final accuracy score isn't in yet. We'd rather stand here and tell you that than paste a made-up number onto a slide a week before it's real.

What *is* already done and checked is everything around it. The eight-class dataset is built — fourteen thousand training images. The evaluation is set up on a strictly held-out split, so there's no cheating where the model grades its own homework. And the serving path is proven — we tested the whole detection pipeline end to end. So the moment training finishes, the real score drops straight into this slide, measured the honest way. Nothing else changes.

*(Handoff.)* I'll pass to [Speaker C] for the pricing side.

---

## Slide 11 — Explainable ML: the valuation model *(~0:55) — Speaker C*

Thanks. Brain number two — the price model. This is the part that turns details into a number you can actually push on.

*(Point at the four stats.)* On held-out testing, its typical error is about twenty percent, and it beats a naive baseline by nearly thirty. It runs on real Dubizzle listings we scraped, not made-up data.

Two things I'm proud of here. First, that price range you saw isn't decorative — we calibrated it so that when it says eighty percent confidence, it genuinely means eighty percent. Second, the bars on the right are SHAP values. SHAP, in plain terms, just shows which factors pushed the price up or down and by how much. And we sanity-checked it — more mileage pulls the price down, an older car pulls it down, a newer year lifts it. The model learned real economics, not noise.

---

## Slide 12 — The agentic layer *(~0:55) — Speaker C*

Brain number three, and the part that ties it all together.

Those seven steps you saw streaming are orchestrated with a framework called LangGraph — think of it as a flowchart the system actually walks through, one agent at a time.

But the piece I really want you to notice is the Verifier. *(Point.)* Its whole job is to catch the system lying. Every price and every citation in the final report has to trace back to a real computed value. If it doesn't, the Verifier flags it. And this isn't theoretical — when we tested it, we fed it a report with a fake price and a made-up source, and it caught both. That's our honesty guarantee, and it lives in the code, not in a promise on a slide.

---

## Slide 13 — Responsible AI *(~0:50) — Speaker C*

This next slide matters to us, because it's about the system knowing its own limits.

Every report tells you how confident it is. It gives you the width of the price range, and when you upload photos, it tells you how sure the damage model is about each thing it found. If the confidence is low, it says so, in plain English, and it tells you to go get a professional inspection. It never pretends to be certain when it isn't.

And again, this is enforced, not aspirational. We wrote it as a test — ninety checks across eighteen different cars, zero failures. The system will never call itself a certified appraisal, because it isn't one, and saying that out loud is a strength, not a weakness.

*(Handoff.)* For the business side, over to [Speaker D].

---

## Slide 14 — Business model: who pays *(~0:50) — Speaker D*

Thanks. So who actually pays for this.

*(Walk the three columns.)* For individual sellers it's free — a few valuations a month. That's the top of the funnel, and honestly it's how we'd gather data to keep improving. The real revenue is the middle column: used-car dealers. A dealer takes in fifteen, twenty trade-ins a month, and they need a fast, defensible price they can show a seller instead of "trust me." That's a tool they'd pay a monthly seat for. And the highest-value tier is the marketplaces and OEMs — they'd license the valuation and damage check as a verified-estimate badge on their own listings, as an API.

The MVP proves the engine works. The dealer tier is where the first real money is, and that's where we'd focus next.

---

## Slide 15 — The stack, and why it's all free *(~0:45) — Speaker D*

A quick word on how this runs for zero cost, because there were real decisions here.

*(Gesture at the grid.)* Frontend on Vercel, the API on Render, the vision model on Hugging Face, database on Supabase, training on Kaggle.

A couple of those were deliberate. A lot of tutorials still say "use Railway" — but Railway doesn't have a real free tier anymore, so we used Render instead. The vision model can't fit in Render's memory, so it lives on Hugging Face, which is the one free tier generous enough to run it. And Supabase pauses a project after a week of no traffic, so we set up a scheduled ping to keep it awake — which means the link won't be dead if you open it a month from now. That last one quietly kills a lot of student projects, and we wanted to get ahead of it.

---

## Slide 16 — Evaluation summary *(~0:45) — Speaker D*

Here's everything we measured, in one place. *(Let them read for a second.)*

Twenty percent price error. Perfect make-matching on comparables. Full marks on report faithfulness.

That red one is actually my favorite. It's a control — we deliberately fed the faithfulness check a report full of hallucinated numbers, and it scored zero. That's the whole point of it. It proves the metric can tell good from bad, instead of just handing out a perfect score to everything. And the vision model's accuracy joins this table the moment training wraps, measured the exact same honest way.

---

## Slide 17 — Limitations *(~0:50) — Speaker D*

We want to name what this doesn't do yet, because we think that's part of doing it properly.

The detector's training isn't finished, so that accuracy number is still pending. There are no user accounts yet — today it's a single-session tool, and proper login, saved history, and multi-tenant isolation are the next build. The price model runs on a fairly small set of real listings, which is honestly why the range comes out wide — and that's exactly why we show a range instead of pretending it's one exact figure. And there's no free feed of accident history in the UAE, so the system can't see undisclosed damage. Which, again, is why it tells you to get an inspection.

---

## Slide 18 — Roadmap *(~0:45) — Speaker D*

So where this goes next, from a capstone to a first paying dealer.

*(Point across the three phases.)* In the next month: finish the CV training, add accounts and saved history, get the whole thing deployed on those free tiers, and slim the memory so it fits. In two to three months: build a proper dealer workspace — bulk intake, PDF reports, quotas — and pilot it with one real used-car dealer here to get honest feedback. And over six months: the verified-estimate API for a marketplace, price alerts, and a browser extension that fills in a listing straight from a valuation. That last layer is what turns a one-time tool into something people come back to.

---

## Slide 19 — Close *(~0:40) — Speaker D (all)*

So to bring it home. This one project proves three things we set out to prove. Real deep learning, with a trained vision model. Real classical machine learning, with a price you can actually question. And real agentic orchestration, with a hard gate that keeps it honest.

Honestly, the thing we learned most building this was that the hard part wasn't the models — it was making the system tell the truth about what it doesn't know. From all four of us, thank you, and we'd love to open up any part of it live right now.

*(Thank the audience. Invite questions.)*

---

*Delivery notes: contractions throughout, vary your pace, and actually pause on the stat slides — silence sells a number. Hand off cleanly at the marked points. With the live demo this runs about fifteen minutes, which still leaves room for questions.*
