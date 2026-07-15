# Hero Cinematic — Porsche 911 GT3 RS  ·  Design Brief

> **Status: DESIGN / BRAINSTORM ONLY — no implementation yet.**
> Owner to pick up: **Krishna**. Direction set by Yash (2026‑07‑15). This folder is the
> working space for the animation — add storyboards, asset notes, spikes, and your own
> ideas here. **Krishna: please brainstorm further on the open questions in §7 before
> any build begins.**

---

## 1. The vision

Open the landing page like the first shot of a Porsche commercial. A **911 GT3 RS**
launches in from the left, rockets right until only its rear wing + bumper hang on the
edge, throws on its reverse lights, slams back into frame, and breaks into a **360° drift
spin** at center — tire smoke, skid marks, camera shake, cinematic light — then settles
into a hero pose. As it settles, a **valuation HUD assembles onto the car** (price +
condition scan + SHAP drivers), turning the spectacle into a live demo of what AutoValuate
actually does. Then it hands off smoothly into the appraisal flow.

Goal in one line: **bonkers enough that people share it, on‑brand enough that it sells the
product.**

## 2. Decisions locked (Yash, 2026‑07‑15)

| Decision | Choice | Why |
|---|---|---|
| **Build approach** | **Hybrid — best of all three** (see §4) | Max wow at a sane performance + mobile cost. |
| **Placement** | **Intro, then hand off to the scan** | Keeps the on‑brand damage‑scan→price story; the Porsche adds spectacle in front of it. |
| **Ending payoff** | **Valuation/spec HUD snaps onto the car** | Makes the flex a product demo — bonkers *and* on‑message. |
| **Mobile** | **Re‑choreographed vertical cut** | Every visitor gets the wow; portrait can't frame a wide drift, so it gets its own cut. |
| **Replay** | Play fully on first hero view; a quick ~1s "settle" on re‑entry (see §6) | A full 5s cinematic on every scroll‑back gets old. |

## 3. Choreography (the beats)

Tune each beat so it *lands* — the GT3 RS's swan‑neck rear wing is its most recognizable
feature; make the silhouette read it instantly.

| # | Beat | ~time | Direction |
|---|---|---|---|
| 1 | **Launch** | 0–1.5s | Near‑black, low engine rumble → car snaps in from left, nose lifted, rear squatting, motion blur, light pool blows out as it passes. |
| 2 | **Bumper tease** | 1.5–2.5s | Rockets right until only wing + bumper + diffuser hang on the edge. Half‑beat hold. Reverse lights punch on. |
| 3 | **Reverse + drift** | 2.5–4.5s | Slams back into frame; at center the wheel cranks and it breaks into a 360° drift. Smoke, skid arcs, camera shake, light strobing off the carbon. **This is the whole show — go loud.** |
| 4 | **Hero pose + HUD** | 4.5–5.5s | Snaps to a 3/4 hero angle, smoke drifting; the valuation HUD assembles onto it. |
| 5 | **Hand‑off** | 5.5s+ | Eases down into the page; the existing scan→detect→price flow / appraisal form takes over as the user scrolls. |

**Elegant merge to explore (Krishna's call):** instead of the Porsche *dissolving* into the
current line‑art hero, let the **scan run on the Porsche itself** at beat 4 — reuse the
existing `scan → damage boxes → price readout` concept (see `frontend/components/hero-car.tsx`
for the current scan language) but on the 3D car. That fuses the two heroes into one and
removes an awkward aesthetic jump from photoreal → line‑art.

## 4. The hybrid approach ("best of all three")

Compose the three techniques so each does what it's best at:

- **Base cinematic (beats 1–3) → pre‑rendered.** Render the launch/reverse/drift once in
  **Blender (Cycles)** with real ray‑traced reflections — higher quality than realtime —
  and ship it as a **compressed video / sprite sequence** played on a canvas. Tiny runtime
  cost, buttery on mobile, no live Three.js perf war during the heavy motion.
- **Hero pose (beat 4) → a slice of live 3D.** Swap to a **lightweight live R3F/Three.js**
  GT3 RS for the final pose so it can subtly **parallax/tilt to the pointer** and the HUD
  can composite in real DOM/WebGL. Interactivity only where it earns its cost.
- **Orchestration, HUD, overlays, replay → GSAP + DOM/SVG.** GSAP (+ ScrollTrigger or an
  IntersectionObserver) sequences the whole timeline, drives the HUD assembly, adds
  skid/smoke/text overlays, and owns the replay + reduced‑motion logic.

This gets ~90% of the full‑3D wow, keeps the bandwidth and frame budget honest, and still
has a live‑interactive finish. (The original maximalist all‑live‑3D spec is preserved in
the appendix for reference — we're deliberately *not* doing that as the base.)

## 5. On‑brand payoff — the HUD

As the car settles, assemble a heads‑up display onto it: **estimated value (AED range)**,
a **condition/scan readout**, and the **top SHAP price drivers** — the same evidence the
real product surfaces. This is the beat that converts "cool car" into "oh, this thing
*values* cars." Keep the numbers illustrative but styled exactly like the real dashboard so
it reads as a genuine preview.

## 6. Constraints & landmines (design around these from day one)

- **Licensing / IP.** "Porsche 911 GT3 RS" is trademarked and free GLB models vary wildly
  in license. For a public, quasi‑commercial site this is a real question. Safer paths: a
  **properly‑licensed model**, or a **GT3‑RS‑*inspired* generic hypercar** that reads the
  same without the badge. **Decide before sourcing assets.**
- **Performance budget.** The project targets **Lighthouse ≥95 / CLS≈0 / mobile / free
  tier**. The hybrid protects this, but hold the line: lazy‑load + code‑split the 3D, cap
  asset weight, dispose GPU resources, poster‑frame first paint so CLS stays ~0.
- **Reduced motion.** Strict `prefers-reduced-motion` discipline across the app. Needs a
  **dignified static fallback**: hero pose + HUD, no motion. Non‑negotiable for a11y score.
- **Sound.** An engine rev is half the "bananas," but autoplay audio is browser‑blocked and
  annoying if forced. **Muted by default + one tasteful unmute toggle.**
- **Replay UX.** Full cinematic on first view; on hero re‑entry do a quick ~1s settle, not
  the whole launch. Reset the GSAP timeline after each play so it's ready for the next entry.
- **Mobile cut.** Portrait can't frame a wide drift — needs its own vertical choreography
  (tighter camera, maybe a shorter beat 2). Protect phone performance aggressively.

## 7. Open questions — **Krishna, brainstorm on these** 🧠

Please weigh in (add your notes below or in a sibling file) before we scope a build:

1. **Merge vs. dissolve:** run the scan *on the Porsche* (§3 merge idea), or dissolve the
   Porsche into the current line‑art hero? Which reads cleaner?
2. **Asset sourcing:** licensed GT3 RS model, or a GT3‑RS‑inspired generic car to sidestep
   IP? Do you have a Blender pipeline / a model in mind?
3. **Where does pre‑rendered stop and live 3D start?** Is beat 4 the right handoff point, or
   should more (or less) be live?
4. **Camera language:** follow the car on entry, zoom on reverse, rotate with the drift,
   clean hero framing — refine the moves. Storyboard it?
5. **HUD content:** exact fields + styling to match the real dashboard. Real sample numbers
   from a valuation?
6. **Sound design:** engine rev + tire screech + a bass hit on the hero pose — worth it, and
   who sources audio?
7. **Scope vs. effort:** is this a headline feature worth ~1–2 weeks, or a lighter first cut
   (e.g., pre‑rendered only, no live 3D) to ship fast and iterate?

## 8. Suggested build phases (later — not now)

1. **Storyboard + timing** (paper/after‑effects blockout) → agree the beats.
2. **Asset spike** — source/license the model, test weight + reflections in Blender.
3. **Pre‑render beats 1–3** → compressed video/sprite; wire GSAP + ScrollTrigger + replay +
   reduced‑motion fallback.
4. **Live 3D hero pose (beat 4)** + HUD assembly, pointer parallax.
5. **Mobile vertical cut.**
6. **Perf pass** — Lighthouse, CLS, dispose/lazy‑load, mobile frame rate.

---

## Appendix — original reference spec (from ChatGPT, for context)

Kept for reference. Note: this is the **maximalist all‑live‑3D** version; §4 deliberately
adopts a **hybrid** instead to protect performance and mobile.

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
don't loop while the user stays; reset the timeline after completion. (§6 softens the
"replay from frame 0" to a quick settle.)

**Performance:** 60 FPS, optimized textures/meshes, dispose unused assets, minimize draw
calls, GPU‑accelerated, responsive across desktop/tablet/mobile.
