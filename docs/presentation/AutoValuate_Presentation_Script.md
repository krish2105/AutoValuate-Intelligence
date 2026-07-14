# AutoValuate Intelligence — Presentation Script

*Spoken script, first person, ~9 minutes. One section per slide. Presenter cues in italics. Read it out loud once before you present — it's written to sound like you talking, not like a paper.*

**Total budget: ~9:00.** Times are per slide.

---

## Slide 1 — Title *(~0:40)*

*(Stay on the title slide. Don't rush into the tech.)*

So a few months back a friend of mine was selling his Corolla. Nice car, looked after it, service history and everything. He took it to a dealer and the guy offered him about eight thousand less than what it was actually worth. And my friend had no way to argue back, because he didn't have a number. He just had a feeling.

That's the whole reason I built this. It's called AutoValuate Intelligence, I'm Krishna, I'm on the MAIB program at SP Jain. And here's the promise: you give it photos of your car and a few details, and it gives you a fair price you can actually defend — with the reasoning shown, not hidden.

*(Point at the screen.)* Everything I'm about to show you is a real running system. The repo is right there, and if you want, you can pull it up and check every number yourself while I talk.

---

## Slide 2 — The problem *(~0:45)*

Let me set the scene, because this isn't a small problem.

*(Pause on the 20.6 billion figure.)* The UAE used-car market is heading toward twenty billion dollars by 2026. It's huge, and it's still growing. And yet the way people price cars in it hasn't really changed.

Three things go wrong. Dealers quote low, because their profit depends on buying cheap — that's just their job. Classified sites don't help either, because they show you what people are *asking*, not what cars actually *sold* for, so you end up anchoring way too high. And damage? Damage is pure guesswork on both sides. Someone sees a dent in the door and knocks off whatever feels right. Nobody can tell you what that specific dent, on a car with this mileage, actually costs you.

---

## Slide 3 — Why existing tools fall short *(~0:40)*

Now, there are online valuation tools out there. But here's the funny thing — most of them still tell you to go pay for an in-person inspection if you want a number you can trust. Which kind of defeats the point of a quick online estimate.

And when you look closely, the reason none of them fully solve it is this. *(Walk across the three columns.)* To do the job properly you need three things at once: you need to actually see the damage, you need to explain how you got to the price, and you need to back it up with real listings. Every one of these exists somewhere. No consumer tool puts all three in one place. That gap is exactly what I went after.

---

## Slide 4 — The solution in one picture *(~0:35)*

Here's the whole thing in one line. Photos and details go in. A trustworthy, explained number comes out.

The part I want you to hold onto is what's in the middle. *(Point.)* It's not one AI model waving its hands. It's three separate systems: a computer-vision model that's actually trained to spot damage, a pricing model that can show its work, and a retrieval layer that pulls up real comparable cars. Three specialists, not one generalist guessing.

---

## Slide 5 — Live demo *(~1:00, plus the demo)*

Okay. Let me stop talking about it and show you.

*(Switch to the live app. Do a real valuation — fill in a Toyota Corolla, hit "Value my car", and let the reasoning trace stream.)*

Watch the left side here. Each step lights up as it happens — intake, then the damage check, then pricing, then it pulls comparables, writes the report, and verifies it. That's the actual system thinking, streamed live.

*(Let the results load. Point at the price range and the chart.)* And there's the answer. A price range, the factors behind it, comparable cars, and a plain-English write-up. One more thing — this all runs locally right now, and the public links are deploying. If you ever want proof, there's a test suite in the repo, one command, and every figure I show you today comes straight out of it.

---

## Slide 6 — System architecture *(~0:50)*

*(Back to the deck.)* This is what's under the hood, and I want to be honest about why it's laid out this way.

At the top is the app you just saw, on Vercel. It talks to an orchestration API on Render, and that API runs the seven steps as a state machine. Underneath sit the three brains: the damage detector on Hugging Face, the price model running inside the API itself, and the comparables search over a vector database.

Here's the point I'd make to a technical audience. This is a genuine hybrid. There's a trained deep-learning model, there's a classical machine-learning model, and there's an agentic layer wrapped around both. It's not a chatbot with a nice coat of paint.

---

## Slide 7 — Deep learning: the damage detector *(~0:50)*

Let's take the three brains one at a time, starting with the vision model.

I trained it on about eighteen thousand real, human-annotated photos of damaged cars, from two public datasets called CarDD and VehiDE. I merged them into one set with eight kinds of damage — dents, scratches, cracks, shattered glass, broken lamps, and so on.

I used a model called YOLOv8, and I deliberately chose *detection* over plain *classification*. The difference matters for money. Knowing a car is damaged isn't enough — a crack in the windshield costs very differently from a scratch on the bumper. So the model has to find *where* the damage is, not just whether it exists.

---

## Slide 8 — CV results *(~0:55)*

Now, this is the slide where I could have shown you an impressive accuracy number. I'm not going to, and I want to explain why.

*(Pause. Be direct.)* The detector is still finishing its training run, on Kaggle's free GPU. So the final accuracy score isn't in yet. I'd rather stand here and tell you that than paste a made-up number onto a slide a week before it's real.

What *is* already done and checked is everything around it. The eight-class dataset is built — fourteen thousand training images. The evaluation is set up on a strictly held-out split, so there's no cheating where the model grades its own homework. And the serving path is proven — I tested the whole detection pipeline end to end. So the moment training finishes, the real score drops straight into this slide. Nothing else changes.

---

## Slide 9 — Classical ML: the valuation model *(~0:55)*

Brain number two — the price model. This is the part that turns details into a number you can push on.

*(Point at the four stats.)* On held-out testing, its typical error is about twenty percent, and it beats a naive baseline by nearly thirty. It runs on real Dubizzle listings I scraped, not made-up data.

Two things I'm proud of here. First, that price range you see isn't decorative — I calibrated it so that when it says eighty percent confidence, it genuinely means eighty percent. Second, the bars on the right are SHAP values. SHAP, in plain terms, just shows which factors pushed the price up or down and by how much. And I sanity-checked it: more mileage pulls the price down, an older car pulls it down, a newer year lifts it. The model learned real economics, not noise.

---

## Slide 10 — The agentic layer *(~0:55)*

Brain number three, and the part that ties it all together.

The seven steps you saw streaming are orchestrated with a framework called LangGraph — think of it as a flowchart the system actually walks through, one agent at a time.

But the piece I really want you to notice is the Verifier. *(Point.)* Its whole job is to catch the system lying. Every price and every citation in the final report has to trace back to a real computed value. If it doesn't, the Verifier flags it. And this isn't theoretical — when I tested it, I fed it a report with a fake price and a made-up source, and it caught both. That's the honesty guarantee, and it lives in the code, not in a promise on a slide.

---

## Slide 11 — Responsible AI *(~0:50)*

This next slide matters to me personally, because it's about the system knowing its own limits.

Every report tells you how confident it is. It gives you the width of the price range, and when you upload photos, it tells you how sure the damage model is about each thing it found. If the confidence is low, it says so, in plain English, and it tells you to go get a professional inspection. It never pretends to be certain when it isn't.

And again, this is enforced, not aspirational. I wrote it as a test — ninety checks across eighteen different cars, zero failures. The system will never call itself a certified appraisal, because it isn't one, and saying that out loud is a strength, not a weakness.

---

## Slide 12 — The stack, and why it's all free *(~0:45)*

Quick word on how this runs for zero cost, because there were real decisions here.

*(Gesture at the grid.)* Frontend on Vercel, the API on Render, the vision model on Hugging Face, database on Supabase, training on Kaggle.

A couple of those were deliberate. A lot of tutorials still say "use Railway" — but Railway doesn't have a real free tier anymore, so I used Render instead. The vision model can't fit in Render's memory, so it lives on Hugging Face, which is the one free tier generous enough to run it. And Supabase pauses a project after a week of no traffic, so I set up a scheduled ping to keep it awake — which means the link won't be dead if you open it a month from now. That last one is the kind of thing that quietly kills student projects, and I wanted to get ahead of it.

---

## Slide 13 — Evaluation summary *(~0:45)*

Here's everything measured, in one place. *(Let them read for a second.)*

Twenty percent price error. Perfect make-matching on comparables. Full marks on report faithfulness.

That red one is my favorite, actually. It's a control — I deliberately fed the faithfulness check a report full of hallucinated numbers, and it scored zero. That's the point of it. It proves the metric can actually tell good from bad, instead of just handing out a perfect score to everything. And the vision model's accuracy joins this table the moment training wraps, measured the exact same honest way.

---

## Slide 14 — Limitations *(~0:45)*

I want to name what this doesn't do, because I think that's part of doing it properly.

The detector's training isn't finished, so that accuracy number is still pending. The price model runs on a fairly small set of real listings, which is honestly why the range comes out wide — and that's why I show the range instead of pretending it's a single exact figure. Inference runs on a free CPU, so it's a few seconds an image, fine for a demo but not built for volume. And there's no free feed of accident history in the UAE, so the system can't see undisclosed damage. Which, again, is exactly why it tells you to get an inspection.

---

## Slide 15 — Roadmap *(~0:35)*

Where this goes next, and I'll be clear these are future ideas, not things I'm claiming I've built.

A bulk tool and an API for dealers — that's the version someone actually pays for. A browser extension that fills in a Dubizzle listing straight from a valuation. And price-trend alerts, so it tells you when your car's segment drops, which turns a one-time tool into something you'd come back to.

---

## Slide 16 — Close *(~0:40)*

So to bring it home. This one project proves three things I set out to prove. Real deep learning, with a trained vision model. Real classical machine learning, with a price you can actually question. And real agentic orchestration, with a hard gate that keeps it honest.

Honestly, the thing I learned most building this was that the hard part wasn't the models — it was making the system tell the truth about what it doesn't know. And I'm happy to open up any piece of it live right now.

Thank you. I'd love your questions.

---

*Delivery notes: contractions throughout, vary your pace, and actually pause on the stat slides — silence sells a number. Total run is around nine minutes with the live demo, which leaves room for questions.*
