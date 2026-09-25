# Spring Drive: An Interactive Explainer

A long-form, Ciechanowski-style article explaining how Seiko's Spring Drive works, with many small interactive widgets embedded in hand-written prose. Physics is simulated in real SI units with plausible 9R-class parameters.

Stack: plain Vite + TypeScript (strict), hand-written `index.html`, Canvas 2D / SVG for widgets, Vitest for unit tests, Playwright for smoke tests, deployed to Cloudflare Pages.

This file is the design: what is being built and why it looks the way it does. It changes when the maintainer changes the design, not as work progresses. Progress lives elsewhere:

- `docs/ROADMAP.md` — the milestones, their acceptance criteria, the project status, and open questions for the maintainer. The nightly loop works from it.
- `PHYSICS.md` — every physical parameter, with its derivation and its label.
- `docs/DECISIONS.md` — choices that would otherwise get re-litigated.
- `docs/ARCHITECTURE.md` — what has actually been built, against the target below.

---

## Architecture

```
/
├── index.html              # The article. Prose is the maintainer's; widgets mount into data-widget slots
├── PLAN.md                 # This file
├── PHYSICS.md              # Parameter derivations and assumptions log
├── CLAUDE.md               # Agent working rules
├── docs/
│   ├── ROADMAP.md          # Milestones, acceptance criteria, status, open questions
│   ├── DECISIONS.md        # Why things are the way they are
│   └── ARCHITECTURE.md     # What has been built, against this plan
├── src/
│   ├── main.ts             # Finds [data-widget] slots, mounts widgets lazily
│   ├── sim/                # Pure TS physics. NO DOM, NO timers, NO globals
│   │   ├── params.ts       # Every physical constant lives here, with units in names or comments
│   │   ├── mainspring.ts   # Torque as a function of barrel angle / remaining turns
│   │   ├── train.ts        # Gear ratio barrel -> rotor, reflected torque and inertia
│   │   ├── rotor.ts        # Glide wheel rigid-body dynamics
│   │   ├── generator.ts    # EMF, coil current, brake torque
│   │   ├── power.ts        # Rectifier, capacitor, IC load, brownout
│   │   ├── quartz.ts       # 32,768 Hz reference and divider chain
│   │   ├── regulator.ts    # Phase comparison and brake duty controller
│   │   ├── detailed.ts     # Fixed-step integrator for sub-rotation visuals
│   │   ├── averaged.ts     # Quasi-steady model for hours/days timescales
│   │   └── types.ts        # SimState, SimParams, Scenario
│   ├── runtime/
│   │   ├── scheduler.ts    # Single rAF loop, global pause, IntersectionObserver, reduced motion
│   │   ├── palette.ts      # Color-coded part tokens (shared by prose and widgets)
│   │   ├── controls.ts     # Slider, scrubber, toggle, button helpers
│   │   └── canvas.ts       # HiDPI canvas setup, resize handling
│   └── widgets/
│       └── <widget-id>/index.ts   # export function mount(el: HTMLElement, opts?): Unmount
├── tools/
│   └── sim-cli.ts          # Headless scenario runner, writes CSV to tools/out/
└── tests/
    ├── sim/                # Vitest physics tests
    └── e2e/                # Playwright smoke tests
```

### Hard boundaries

- `src/sim` never imports from `runtime` or `widgets`, and never touches the DOM. It must run identically under Node (CLI, tests) and the browser.
- Widgets read sim state and render. They do not implement physics.
- One `requestAnimationFrame` loop total, owned by the scheduler. Widgets register tick callbacks and are paused when offscreen, when globally paused, or when `prefers-reduced-motion` is set (in which case they render a static frame plus a play button).

---

## Physics

### Published anchors (treat as fixed)

| Quantity | Value | Notes |
|---|---|---|
| Glide wheel target speed | 8 rev/s | Seiko's published figure |
| Quartz reference | 32,768 Hz | Standard watch crystal |
| Power reserve | 72 h | 9R65 |
| Rated accuracy | ±15 s/month (≈ ±0.5 s/day) | 9R65 spec; the model should land comfortably inside this |

IC power consumption is reported in Seiko material as extremely low (tens of nanowatts). Verify a source before putting a number in `params.ts`, and log it in `PHYSICS.md`.

### Everything else is derived, and every derivation goes in PHYSICS.md

Torque curves, inertias, coil constants, and capacitor values are not public. Derive them so the system is self-consistent with the anchors above, record each assumption with a one-line justification, and keep the article honest about which numbers are modeled.

Suggested derivation order:

1. Pick barrel turns for full wind (assumption, roughly 6 to 8). Gear ratio follows from 8 rev/s × 72 h ÷ barrel turns.
2. Pick a mainspring torque curve shape (roughly flat through the middle, rising near full wind, falling near run-down).
3. Size rotor inertia and friction so that, unbraked at full wind, the rotor clearly runs fast (runaway widget needs this to be dramatic).
4. Pick generator constant `k_e` (V·s/rad) and coil resistance so that at 8 rev/s the rectified output sustains the IC with margin, and the available brake torque range can absorb the mainspring's excess torque across the whole wind range.
5. Choose capacitor size and brownout threshold so regulation survives normal operation and fails gracefully near the end of the reserve.
6. Check the energy budget: mainspring energy ≈ ∫ friction + brake dissipation + IC consumption over 72 h.

### Core equations

- Rotor: `J · dω/dt = τ_spring(θ_b) / G · η − τ_friction(ω) − τ_brake`
- EMF: `e = k_e · ω`
- Brake torque with coil loaded through effective resistance `R`: `τ_brake = k_e² · ω / R`, with the effective `R` set by the regulator's brake duty
- Capacitor: `C · dV/dt = i_rectified − P_ic / V`, with brownout when `V < V_min`
- Reference phase: `φ_ref(t) = 2π · 8 · t`, derived from the quartz divider chain
- Phase error: `φ_err = θ_rotor − φ_ref`

### Regulator

Seiko's actual control law is not public. Model it as a discrete controller that compares rotor pulses against the divided quartz reference and sets brake duty once per update (per rotor revolution, or at a fixed rate; document the choice). A PI controller on phase error with duty clamped to [0, 1] is a reasonable starting point. The article must state that this is a model of the principle, not the 9R's firmware.

### Two simulation modes

- **Detailed:** fixed timestep in the 2 to 4 kHz range, semi-implicit Euler or RK4. Used for anything showing individual rotations, coil waveforms, or the phase scope.
- **Averaged:** quasi-steady per-rotation or per-second model. Used for hours-to-days timescales (rate error in s/day, 72 h rundown). Detailed mode at kHz for 72 h in a browser is not acceptable.
- Tests must confirm the two modes agree on mean rotor speed and rate error over overlapping windows.

### Required physics tests (Vitest)

1. **Runaway:** brake disabled at full wind, rotor settles well above 8 rev/s.
2. **Lock:** brake enabled at full wind, rotor locks to 8 rev/s within a documented time (a few seconds of sim time).
3. **Rate:** averaged mode over 24 h at mid-wind yields rate error within ±0.5 s/day.
4. **Rundown:** from full wind, regulation holds for roughly 72 h (±10%), then the rotor falls below 8 rev/s, the IC browns out, and the rotor stops.
5. **Energy accounting:** spring energy spent equals dissipation plus IC consumption plus change in kinetic energy, within tolerance.
6. **Disturbance recovery:** an impulse to the rotor (simulated shock) is rejected and lock is regained.
7. **Mode agreement:** detailed and averaged modes agree within tolerance over a shared window.
8. **Determinism:** same params and seed produce identical output.

---

## Article outline and widgets

Each section gets prose (the maintainer writes it) and one primary widget. Widget IDs are stable and used as `data-widget` values.

| # | Section | Widget ID | What the reader does |
|---|---|---|---|
| 0 | Intro | `hero-glide` | Watches a gliding seconds hand next to a ticking mechanical one |
| 1 | The runaway | `runaway` | Winds a spring driving an unregulated rotor and watches it overspin and die fast |
| 2 | Spinning makes electricity | `generator` | Drags rotor speed, sees EMF waveform and amplitude track it |
| 3 | Electricity pushes back | `lenz-brake` | Adjusts coil load, watches braking torque and spin-down curves change |
| 4 | A reference that doesn't drift | `quartz` | Sees the crystal's 32,768 Hz divided down to the 8 Hz reference |
| 5 | Closing the loop | `loop` | Toggles regulation, taps to shock the watch, watches the phase-error scope and brake duty |
| 6 | Tri-synchro, all together | `tri-synchro` | Full system with time acceleration, power reserve gauge, rundown to brownout |
| 7 | (Optional) The real movement | `movement-3d` | Draggable 3D view, three.js, only if time allows |

Every widget must:
- Mount via `mount(el, opts)` and return an unmount function.
- Use palette tokens so part colors match the color-coded terms in the prose.
- Work on a 380 px wide phone viewport and be operable by touch.
- Respect global pause and reduced motion.
- Show units on every readout.

---

## Milestones

M0 Scaffold, M1 Sim core and PHYSICS.md, M2 Averaged mode and CLI, M3 `runaway` and `hero-glide`, M4 `generator`, M5 `lenz-brake`, M6 `quartz`, M7 `loop`, M8 `tri-synchro`, M9 Polish, M10 (optional) `movement-3d`.

Their checklists and acceptance criteria live in `docs/ROADMAP.md`, one task per milestone, ticked as each one lands. One milestone per pull request.

---

## Out of scope

- Writing article prose (agents leave `<!-- PROSE: ... -->` stubs)
- Frameworks (React, Svelte, etc.) or a component library
- Analytics, cookies, or any network requests at runtime
