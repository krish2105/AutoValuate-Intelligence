# Hero Cinematic — Grand-Tourer Launch Sequence · Design Brief v2

> **Status: DESIGN — buildable as scoped.** v1 (Porsche 911 GT3 RS, hybrid Blender +
> live-3D) is preserved in full at the bottom as **Appendix A**. This v2 is a full
> re-brainstorm by Krishna that keeps the *vision* and *choreography* intact but changes
> the **build method** entirely: pure SVG + Framer Motion, extending the hero that already
> ships in `frontend/components/hero-car.tsx` — **zero new binary assets, zero licensing
> risk, zero 3D/WebGL dependency, zero new npm packages.**

---

## 1. Why the build method changed

v1's hybrid (pre-rendered Blender video for beats 1–3 + live R3F/Three.js for beat 4) is a
legitimate approach — but for *this* team, *this* deadline, and *this* infra, it carries
real cost that a vector approach doesn't:

| Risk in v1 (Blender + live 3D) | Same beat, done in v2 (SVG + Framer Motion) |
|---|---|
| **Trademark risk** — "911 GT3 RS" is a real, licensed car; a public site can't safely ship a photoreal or lightly-reskinned GLB of it | The hero is **already original abstract line-art** (`role="img"` alt text literally says *"grand-touring car"*, not Porsche) — there was never a badge to license |
| **No 3D pipeline exists** — nobody on the team has shipped a Blender render → compressed-video pipeline; this is new tooling, new skill, new maintenance surface | The whole app already runs on **Framer Motion**, which every contributor has used all session (`hero.tsx`, modals, charts, cards) — zero new tooling |
| **New binary assets** — a compressed cinematic video (or GLB) has real weight; on Vercel's free-tier bandwidth and a mobile connection, this is the thing most likely to blow the perf budget | **No new assets at all.** SVG paths + `transform`/`opacity`/`stroke` keyframes are code, not downloads — the sequence adds bytes to the JS bundle, not a video payload |
| **WebGL correctness risk** — live 3D on a range of mobile GPUs (the exact devices this product's UAE users are on) is the single biggest source of "works on my laptop, breaks in the field" bugs | Pure DOM/SVG transforms are the same primitives already proven across every animated surface in the app, including on the 320px-viewport a11y sweep already passed at **0 WCAG violations** |
| **1–2 week estimate** (Yash, §7) for storyboard → asset spike → render → wire → mobile cut → perf pass | **2–4 focused sessions** — most of the timeline, pointer-tilt physics, and reduced-motion handling is *already written* in `hero-car.tsx`; this is choreography on an existing rig, not a new subsystem |

**The core insight:** v1 treated the cinematic and the existing scan-hero as two different
heroes that need reconciling (§3's "merge vs. dissolve" question). In v2 there's only ever
**one asset** — the same line-art car — so that question dissolves on its own: the launch
sequence *is* the draw-in, just choreographed with more spectacle before it settles into
the pose and ambient scan-loop that already ship today.

---

## 2. The vision (unchanged from v1)

Open the landing page like the first shot of a car commercial. A grand-tourer silhouette
launches in from the left, rockets past until only its tail hangs on the edge of frame,
throws on its lights, slams back into frame, and breaks into a **360° drift flourish** —
skid arcs, smoke, camera shake — then settles into the hero pose. As it settles, the
**existing ambient scan-loop takes over natively**: the scanner sweep runs, damage
findings pop, the price readout lands. Spectacle resolves directly into product demo,
because it was always the same object.

**Goal, unchanged:** bonkers enough that people share it, on-brand enough that it sells
the product — but now also *cheap enough that it costs nothing to run at scale*, which is
the whole thesis of this project (the on-device CV point) extended to its own homepage.

---

## 3. Choreography — same beats, vector techniques

| # | Beat | ~time | v1 direction (3D) | v2 technique (SVG + Framer Motion) |
|---|---|---|---|---|
| 1 | **Launch** | 0–1.2s | Blender: nose lift, suspension squat, motion blur, light bloom | `<motion.g>` wrapping the whole car path, animated `x: [-400, 0]` with a `filter: blur()` keyframe that peaks mid-flight and clears on arrival (CSS filter, GPU-cheap); the existing `floorGlow` radial gradient brightens as it passes, faking the light-pool sweep |
| 2 | **Tease exit** | 1.2–2.0s | Rockets right to bumper-only, reverse lights punch on | Continue the same `x` keyframe past the viewport edge (car container is wider than the visible stage, so "only the tail shows" is just clipping via `overflow-hidden` on the parent); the existing tail-light path (`stroke="hsl(var(--bad))"`) flashes via an opacity keyframe |
| 3 | **Reverse + drift** | 2.0–4.0s | Slam back, 360° drift, smoke, skid marks, camera shake | Spring back to `x: 0` with slight overshoot (`type: "spring", bounce: 0.35`); layer a `rotate` keyframe on the group for the drift arc (doesn't need to be a literal 360 — a 25–35° whip-and-recover with speed-lines reads as "drift" without disorienting the layout); **skid marks** = two more `pathLength`-drawn strokes behind the wheels, reusing the exact `draw()` helper already in the file; **smoke** = 4–6 blurred, radially-gradiented circles that scale up + fade out from behind each wheel (cheap, no particle engine); **camera shake** = a few ms of randomized `x`/`rotate` jitter keyframes on the *outer* hero container, not the car itself, so the DOM around it (headline, CTA) shakes too — sells the impact |
| 4 | **Hero pose + HUD** | 4.0–4.8s | Snap to 3/4 pose, live-3D parallax, HUD assembles | **This beat already exists and ships today** — it's the pointer-tilt (`rotateX`/`rotateY` springs) settling to rest, and the ambient scan-loop (scanner sweep → findings → price readout) is *already the HUD*. v2 adds nothing new here except making sure the loop's *first* pass is timed to start right as beat 3 settles, so it reads as the payoff rather than a delayed afterthought |
| 5 | **Hand-off** | 4.8s+ | Ease into the page, appraisal flow takes over | No change needed — the existing "Begin appraisal" CTA and scroll-down affordance already sit below the hero exactly as designed |

**Net new code:** one entrance timeline (beats 1–3) prepended before the current draw-in,
reusing the file's own `draw()`/`appear()` helpers and `EASE` constant. Beat 4–5 are
**already shipped** — this brief is really scoped to *~3 seconds of new choreography*, not
a new hero.

---

## 4. Open questions — resolved

Answering Yash's §7 directly, now that the build method has changed:

1. **Merge vs. dissolve** — moot. There is one asset throughout; nothing needs to merge or
   dissolve into anything else. This was v1's hardest problem and v2 deletes it.
2. **Asset sourcing** — none needed. No model to license, no Blender pipeline to build or
   maintain. The "GT3 RS" framing is dropped entirely in favor of the existing
   brand-neutral "grand-touring car."
3. **Pre-rendered vs. live-3D split** — moot; everything is live, and "live" here means
   cheap `transform`/`opacity` keyframes, not a WebGL render loop. There's no perf cliff to
   budget around.
4. **Camera language** — faked at the container level: a subtle `scale` pulse on the
   reverse beat (reads as a push-in), the rotate-jitter on impact (reads as camera shake),
   no literal camera object needed.
5. **HUD content** — **already answered by the shipped code.** The ambient loop's findings
   (`lamp 0.71`, `scratch 0.64`, `dent 0.87`) and price readout (`EST. AED 127,900 ·
   ADJUSTED`) already use the real dashboard's visual language (mono font, confidence
   chips, accent-colored price). v2 just times the first loop pass to land as the beat-4
   payoff instead of starting cold.
6. **Sound** — deprioritized rather than resolved. Muted-by-default with a manual unmute
   toggle if pursued later; not a blocker to shipping the visual sequence, and a real
   engine sample still carries the same licensing shadow the car model did — if pursued,
   use a synthesized whoosh/hit, not a recording.
7. **Scope vs. effort** — **this is the actual answer to the brief.** The rewritten scope
   is small enough to build, ship, and iterate on directly, rather than being a standalone
   1–2 week feature that risks the presentation timeline.

---

## 5. Constraints — how v2 satisfies them by construction

- **Licensing** — non-issue; original abstract art, always was.
- **Performance budget (Lighthouse ≥95 / CLS≈0)** — no new assets means no new weight;
  `transform`/`opacity`/`filter` are the three CSS properties that animate on the
  compositor thread without triggering layout, so this is the *cheapest possible* way to
  build a sequence this size. CLS stays 0 because the SVG's `viewBox` reserves its box
  exactly as it does today — nothing shifts size mid-sequence.
- **Reduced motion** — the file already branches every single animation on
  `useReducedMotion()`; the new beats plug into that exact pattern (`reduced ? {} :
  {...keyframes}`), so the fallback is automatic, not bolted on.
- **Mobile cut** — no separate vertical choreography pipeline needed. The `viewBox` scales
  responsively already; a mobile-specific tweak (if the drift whip feels too wide on a
  narrow container) is a media-query-gated keyframe *value*, not a second asset.
- **Replay** — the existing `LOOP`/`CYCLE` constants already define "play once, then loop
  ambiently"; the new entrance beats just run once before that loop starts, using the same
  `whileInView`-style viewport trigger pattern (`Reveal` in `ui.tsx`) already used
  elsewhere in the app.

---

## 6. Buildable phases

1. **Phase 1 — Launch + tease (beats 1–2).** Wrap the existing car `<motion.g>` in an
   entrance `x`/`filter(blur)` keyframe; clip the stage; verify against reduced-motion and
   at 320/375/768/1440 (the same sweep already run on the rest of the app).
2. **Phase 2 — Reverse + drift (beat 3).** Spring back-in, add the rotate whip, two skid
   strokes (reuse `draw()`), 4–6 smoke circles, and the container-level shake jitter.
   Verify frame budget stays smooth on a throttled-CPU DevTools pass.
3. **Phase 3 — Timing pass.** Retime beat 4's *existing* ambient loop delay so its first
   pass lands as the payoff of beat 3 (currently `delay: 3.2`s on `LOOP` — tune this one
   constant against the new entrance length rather than rebuilding the loop).
4. **Phase 4 — Polish.** Optional: mobile-specific keyframe values if the whip reads too
   wide on narrow viewports; optional muted sound.

Each phase is independently shippable and testable — there's no "big bang" integration
step, unlike v1's render→wire→mobile-cut→perf-pass chain.

---

## Appendix A — v1 original brief (Porsche 911 GT3 RS, hybrid Blender + live 3D)

*Preserved in full for reference. Superseded by the vector approach above for build
reasons in §1; the choreography and creative vision it captures directly informed v2's
beat table in §3.*

### A.1 The vision

Open the landing page like the first shot of a Porsche commercial. A **911 GT3 RS**
launches in from the left, rockets right until only its rear wing + bumper hang on the
edge, throws on its reverse lights, slams back into frame, and breaks into a **360° drift
spin** at center — tire smoke, skid marks, camera shake, cinematic light — then settles
into a hero pose. As it settles, a **valuation HUD assembles onto the car** (price +
condition scan + SHAP drivers), turning the spectacle into a live demo of what AutoValuate
actually does. Then it hands off smoothly into the appraisal flow.

Goal in one line: **bonkers enough that people share it, on‑brand enough that it sells the
product.**

### A.2 Decisions locked (Yash, 2026‑07‑15)

| Decision | Choice | Why |
|---|---|---|
| **Build approach** | **Hybrid — best of all three** (see A.4) | Max wow at a sane performance + mobile cost. |
| **Placement** | **Intro, then hand off to the scan** | Keeps the on‑brand damage‑scan→price story; the Porsche adds spectacle in front of it. |
| **Ending payoff** | **Valuation/spec HUD snaps onto the car** | Makes the flex a product demo — bonkers *and* on‑message. |
| **Mobile** | **Re‑choreographed vertical cut** | Every visitor gets the wow; portrait can't frame a wide drift, so it gets its own cut. |
| **Replay** | Play fully on first hero view; a quick ~1s "settle" on re‑entry | A full 5s cinematic on every scroll‑back gets old. |

### A.3 Choreography (the beats)

| # | Beat | ~time | Direction |
|---|---|---|---|
| 1 | **Launch** | 0–1.5s | Near‑black, low engine rumble → car snaps in from left, nose lifted, rear squatting, motion blur, light pool blows out as it passes. |
| 2 | **Bumper tease** | 1.5–2.5s | Rockets right until only wing + bumper + diffuser hang on the edge. Half‑beat hold. Reverse lights punch on. |
| 3 | **Reverse + drift** | 2.5–4.5s | Slams back into frame; at center the wheel cranks and it breaks into a 360° drift. Smoke, skid arcs, camera shake, light strobing off the carbon. **This is the whole show — go loud.** |
| 4 | **Hero pose + HUD** | 4.5–5.5s | Snaps to a 3/4 hero angle, smoke drifting; the valuation HUD assembles onto it. |
| 5 | **Hand‑off** | 5.5s+ | Eases down into the page; the existing scan→detect→price flow / appraisal form takes over as the user scrolls. |

### A.4 The hybrid approach ("best of all three")

- **Base cinematic (beats 1–3) → pre‑rendered.** Render the launch/reverse/drift once in
  **Blender (Cycles)** and ship it as a **compressed video / sprite sequence** played on a
  canvas.
- **Hero pose (beat 4) → a slice of live 3D.** Swap to a **lightweight live R3F/Three.js**
  GT3 RS for the final pose so it can subtly **parallax/tilt to the pointer**.
- **Orchestration, HUD, overlays, replay → GSAP + DOM/SVG.**

### A.5 On‑brand payoff — the HUD

As the car settles, assemble a heads‑up display onto it: **estimated value (AED range)**,
a **condition/scan readout**, and the **top SHAP price drivers**.

### A.6 Constraints & landmines

- **Licensing / IP** — "Porsche 911 GT3 RS" is trademarked; free GLB models vary wildly in
  license.
- **Performance budget** — Lighthouse ≥95 / CLS≈0 / mobile / free tier.
- **Reduced motion** — strict `prefers-reduced-motion` discipline, dignified static
  fallback.
- **Sound** — muted by default + one tasteful unmute toggle.
- **Replay UX** — full cinematic on first view; quick ~1s settle on re‑entry.
- **Mobile cut** — portrait can't frame a wide drift, needs its own vertical choreography.

### A.7 Original reference spec (from ChatGPT, for context)

**Stack:** React + Next.js · Three.js · React Three Fiber · @react‑three/drei · GSAP +
ScrollTrigger · @react‑three/postprocessing (Bloom, DOF, Tone Mapping, Vignette, Chromatic
Aberration, Motion Blur) · HDRI environment lighting · GLTF/GLB GT3 RS model · GPU particle
system (tire smoke, dust, debris) · KTX2 + Draco compression · lazy loading + code splitting
· rAF rendering targeting 60 FPS.

**Sequence:** near‑black start → aggressive launch from left (accel, suspension, wheel spin,
motion blur, reflections) → continues until only the rear bumper shows on the right →
reverse lights → rapid reverse back into frame with braking → sharp steering + fast 360°
drift at center (smoke, dust, skid marks, camera shake, dynamic light, motion blur) → ~1s
centered hero pose → smooth transition into the page.

**Camera:** cinematic choreography — follow on entry, slight zoom on reverse, subtle rotate
with the drift, clean hero framing to finish.

**Trigger:** play once when the hero enters the viewport; replay from frame 0 on re‑entry;
don't loop while the user stays; reset the timeline after completion.

**Performance:** 60 FPS, optimized textures/meshes, dispose unused assets, minimize draw
calls, GPU‑accelerated, responsive across desktop/tablet/mobile.
