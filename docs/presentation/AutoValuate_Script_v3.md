# AutoValuate Intelligence: presentation script (v3, ~20 minutes, 15 slides)

*Five presenters, three slides each. Verified against repository commit `14a8408` (14a84088bbf6b70340221538765ddb692fb46ce3), reviewed 27 July 2026. The same text lives in each slide's speaker notes.*

## Slide 1: Krishna Mathur

Good morning everyone. We're the AutoValuate team: myself, Atharva, Yash, Sarth and Krish. Over the next twenty minutes we want to show you something that actually runs, not a concept. AutoValuate tells you what a used car in the UAE is worth, and unlike every price checker we could find, it shows you the reasoning behind the number. You can open it on your phone right now, it's free, and every claim we make today traces back to a file in our repository.

One housekeeping note before we start. Everything in this deck was checked against the repository as it stood this morning. Repository version reviewed for this presentation: commit 14a84088bbf6b70340221538765ddb692fb46ce3, reviewed on 27 July 2026. The screenshots you'll see were taken from the live deployment on the same day, so what you see here is what a user gets.

Let me set up the problem first, because the product only makes sense once you feel how one-sided this market is.

## Slide 2: Krishna Mathur

Here's the shape of the thing. You type in a car, add photos if you want, and the app gives you a price range, the reasons behind it, a damage assessment, live market context, and a report where every number is checked before you see it.

Two numbers on this slide matter most. The median pricing error is 13.18 percent, measured on held-out data, and I want to stress that we report the median honestly rather than quoting our best fold. And the cost to the user is zero. The whole stack runs on free tiers: Vercel for the frontend, Render for the API, Supabase for data.

The fifteen panels sound like a lot, but they follow one idea: a valuation alone doesn't finish the job. A seller still has to judge an offer, decide on repairs, write a listing, and negotiate. The product walks all the way to that finish line. And behind it sit 142 automated tests, which we'll come back to when we talk about engineering.

## Slide 3: Krishna Mathur

The UAE used-car market is big and busy, and the information in it is lopsided. A dealer prices cars every single day. A private seller does it maybe once every four years, usually by looking at a few listings and guessing. When those two sit down together, one side has data and the other has a feeling.

The tools that exist don't fix this. They give you a single number and stop. No reasoning, no sense of how confident that number is, and nothing about the actual condition of your actual car. Try defending a number like that when a buyer pushes back. You can't, because you don't know where it came from either.

That's the gap we built for. Not a fancier number. A defensible one. Our users are the seller pricing before listing, the buyer sanity-checking an ask, the small dealer with a fleet spreadsheet, and developers who want the engine through an open API. With that framing, Atharva will walk you through what using it feels like.

## Slide 4: Atharva Soundankar

Thanks Krishna. This is the real app, photographed from the live site this morning.

The journey starts simple. You describe the car, or even type a sentence like "2019 Nissan Patrol, 120 thousand kilometres" and let the form fill itself. Photos are optional, and that's deliberate. If you add them, the damage scan runs on your own device. If you don't, the app says plainly that condition wasn't verified, and prices accordingly.

The right screenshot is the part people remember. While the system works, you watch each agent report in: intake, damage aggregation, the pricing model, comparable listings, report writing, then a verifier that checks every number in that report against computed evidence. It streams live. Nothing hides behind a spinner.

Why show the pipeline at all? Because trust is the product. If we're asking a seller to walk into a negotiation with our number, they deserve to see how it was made. The next two slides open up the two models doing the heavy lifting.

## Slide 5: Atharva Soundankar

The pricing engine is XGBoost trained on 1,302 real UAE listings. That's a modest corpus, and you'll hear us be honest about that later, but two decisions squeeze a lot out of it.

First, every car is joined to its physical specification: horsepower, torque, weight, fuel economy. We proved this join helps with a paired, permutation-controlled study before shipping it, and it took the median error from about fifteen and a half percent to 13.18. When we shuffled the specs as a control, the gain vanished, which is how you know it's signal and not leakage.

Second, we never give one number. The band around the estimate is split-conformal, calibrated separately for luxury and mass-market cars, and it keeps its promise: we target 80 percent coverage and measure 79 on held-out data.

The chart on the left is SHAP, which turns the model inside out. Mileage pulled this price down by so many dirhams, engine size pushed it up. That's what makes the number arguable in a real negotiation instead of a take-it-or-leave-it verdict.

## Slide 6: Atharva Soundankar

The damage model is a YOLOv8 detector we trained on around fourteen thousand images across eight damage classes, exported to ONNX and run inside the browser. Your photos never leave your device. That's not a checkbox for us, it's the reason the feature can be free: there's no GPU bill because the user's own hardware does the work.

Every finding carries provenance. The scan stamps which model version and which preprocessing produced it, and the backend refuses a condition report whose versions don't match what we ship. Nobody can forge a clean scan.

The right side is our newest addition, and it exists because we measured our own weakness. This detector was trained on close-up damage photos, so its output is sensitive to framing. We can't retrain it without more UAE photos, but we can stop bad photos at the source. So a small second model, deliberately Apache licensed and only three and a half megabytes, now checks every capture: too far away, car cut off, blurry, too dark. You get told while you're still standing next to the car. It advises, it never scores.

## Slide 7: Yash Petkar

Thanks Atharva. A valuation answers one question: what is this car worth? Real decisions need three more, and that's this slide.

The deal score, on the left, takes an asking price the user types in and places it against the model's fair-value range. In this live example someone asks 105 thousand for a Patrol the model values at 92, and the card says so: 29 out of 100, above fair value. One important design choice: the asking price never enters the pricing model. It would only teach the model to agree with the seller.

The middle panel is the what-if explorer. Drag mileage, year or condition and watch the price re-compute against the live model. Those what-if conditions are clearly synthetic, never confused with a real photo scan.

The right panel is the financing estimator, and it has a genuinely local insight. UAE banks advertise flat rates, where interest is charged on the whole principal for the whole term. A three percent flat quote is really about five point six percent in APR terms, and this card shows both. It also warns below a twenty percent down payment, because Central Bank Regulation 29 of 2011 caps car finance at eighty percent of vehicle value. Indicative only, of course. Not an offer, and it knows nothing about a person's salary or eligibility.

## Slide 8: Yash Petkar

These three panels answer the questions that come after the price.

Repair first. When the scan finds damage, the app maps each finding to an indicative UAE workshop cost range, scaled by severity. Then it does the comparison that actually matters: this damage is costing you roughly this much in value, against a repair bill of roughly that much. When fixing before selling pays for itself, it says so. These are published workshop ranges, not quotes, and the card says that too.

The middle chart is depreciation drawn from live listings: every dot is a real car of this model at some age, with your car placed on the curve. It uses asking prices, not sale prices, and the caption admits that, because sellers usually settle below ask.

The right panel projects your specific car forward through the pricing model itself: what does the model think this car is worth at one, two, three more years of age and mileage? That turns "should I sell now or hold" from a gut feeling into a curve you can look at. A projection, clearly labelled, never a guarantee.

## Slide 9: Yash Petkar

Everything you've seen is anchored to a live corpus of about thirteen hundred UAE listings, refreshed every week by a scheduled scrape with a hard budget cap so it can never blow through the free tier.

The analytics view places your car among its comparables: price against mileage, your estimate in the middle, and your market percentile. In the seller report those same comparables appear with citations, so when the app claims a similar Patrol listed at 116 thousand, you can check that claim.

The part I most want you to notice is what happens when data is missing. Ask for a rare model and the card does not quietly draw a chart out of two points. It tells you the corpus is thin for this car and that the valuation is leaning on the model rather than comparables. We think refusing to fake a chart is a feature. Thirteen hundred listings is honestly small, it's the biggest limit on our accuracy, and the weekly pipeline exists precisely to grow it. Sarth will take you from here to what the user walks away with.

## Slide 10: Sarth Malankar

Thanks Yash. This is where the product earns its keep, because analysis nobody acts on is trivia.

The seller report on the left is written by a language model but kept on a very short leash. It may only use figures from the computed evidence pack, every number carries a citation, and a deterministic verifier re-checks the whole thing before display. In this example, twelve numbers and sixteen citations, all traced. If the language model invents anything, the report is rejected and a deterministic writer takes over. The same discipline runs the grounded assistant: ask it anything about your valuation and an answer with an unverifiable number never reaches you.

The negotiation coach turns the evidence into talking points: open here, hold above this, here's the comparable to cite, disclose the dent before they find it. Sell mode and buy mode argue opposite sides of the same facts.

The listing pack writes the ad itself, damage disclosed on purpose. And everything sends. One tap shares the script or listing through your phone's share sheet, WhatsApp first, because that's where UAE car deals actually happen. There's also a public share link, a PDF and a certificate.

## Slide 11: Sarth Malankar

Here's how it hangs together. The browser does more work than usual in this architecture: both vision models run there in ONNX, which is what keeps photos private and inference free. The frontend lives on Vercel and redeploys from the main branch on every push.

The backend is FastAPI on Render running a LangGraph pipeline, seven steps from intake to confidence disclosure. Each step is a small agent with one job, which made the system much easier to test than one big function. The pricing model ships as a bundle with its spec table baked in, so inference never needs the raw spec file. Supabase holds the comparables with vector retrieval, plus the public share links. GitHub Actions runs continuous integration, the weekly corpus scrape, and the keep-alive pings that stop free-tier services from sleeping.

One thread stitches all of it together: provenance. Every scan carries the hash of the model that produced it and the version of the preprocessing it ran through. The backend checks those stamps and refuses what it doesn't recognise. On free infrastructure, that discipline is what makes the results trustworthy.

## Slide 12: Sarth Malankar

Two engineering habits define this project. The first is that nothing ships on a feeling. When we believed joining vehicle specs would help pricing, we ran a paired study with a permutation control before wiring it in. When an idea failed, and several did, we wrote down why, so future us doesn't retry it. Our repo has a findings file whose main content is fixes we tried and rejected with measurements attached.

The second habit is treating determinism as a feature. Early on, the same photo could produce different scores on different runs, and we traced it to GPU canvas resampling being non-deterministic. We replaced it with pure JavaScript pixel math and pinned it with tests. Same bytes, same score, every time. And because the browser computes the score users see, we hold a parity suite proving browser and backend agree on all fifty-six pinned cases.

All of it, 142 tests, runs in CI on every push. Training is reproducible from the committed corpus, and the public model card renders the generated metrics files directly, so no number on that page was ever typed by hand. Krish will now show you what those numbers actually say, including the unflattering ones.

## Slide 13: Krish Kumar

Thanks Sarth. This is our model card. It's a public page in the product, and its rule is simple: every metric a user might care about, including the ones that embarrass us.

Some results we're proud of. Report faithfulness scores a perfect one, and we know the metric isn't a rubber stamp because we feed it a deliberately corrupted report as a control and that scores zero. The confidence intervals keep their promise within about one percentage point across every level we test.

Now the honest part. Our damage detector's headline accuracy, 0.732, was measured on a validation subset covering six of the eight classes, and we say so right on the page. Worse, we discovered the detector is sensitive to how a photo is framed: a small crop can swing the condition score by tens of points. We wrote the diagnosis down, shipped capture coaching as mitigation, and prepared a retraining notebook that waits on one thing we cannot conjure: labelled photos of whole cars in UAE conditions.

And pricing has a floor. Our own learning curve says this corpus size supports about thirteen percent error. Reaching eight needs thousands more listings, which is why the weekly pipeline matters more than any tuning.

## Slide 14: Krish Kumar

Beyond the single valuation there are four surfaces. A buyer can compare up to four cars side by side and see which is genuinely the better deal, not just the cheaper sticker. A small dealer can upload a CSV and get the fleet valued in one pass; the screenshot shows three cars valued together. Developers get the same engine through an open API with no key, and the model card keeps us honest in public.

On commercial reality, we'd rather state it than have you find it. Our damage model derives from YOLOv8, which is AGPL licensed. That means selling this as closed-source software would need either Ultralytics' commercial licence or swapping the detector. It's why the product is free today, and why every component we've added since, like the capture coach, is deliberately Apache licensed. The problem stays contained instead of growing.

The road from here has three stones: retrain the detector on real UAE photos, which fixes our biggest weakness at the root. Grow the corpus toward five thousand listings, which our learning curve says buys real accuracy. And an Arabic interface, because a UAE product without one leaves out half its market.

On contributions: this was genuinely joint work across the five of us, spanning the detector, the pricing model, the agent backend, the frontend and the evaluation harness.

## Slide 15: Krish Kumar

So that's AutoValuate. A seller walks in with a feeling and walks out with a number they can defend: here's the price, here's why, here's what the damage does to it, here's the comparable to cite, and here's the message to send.

Everything you saw today is live. The left code opens the product; it's free and there's no sign-up, so you can price a car before we finish taking questions. The right one opens the repository, where every metric we quoted today exists as a committed file you can regenerate yourself. This deck was verified against commit 14a8408 as of this morning, and that's printed at the bottom so there's no ambiguity about which version we presented.

We'd rather show you than tell you, so we'll finish with a live demo. And we're happy to take the hard questions, including the ones about what doesn't work yet. We wrote those down too. Thank you.
