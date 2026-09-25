# Decisions

Short records of choices that would otherwise get re-litigated. Add them as they are made. When one is reversed, amend it rather than deleting it, so the history of why stays readable.

A physical parameter is not a decision. It goes in `PHYSICS.md`. A decision belongs here when it is about how the model or the site is built: an integrator, a control law's update rate, a dependency, a test strategy.

Decisions 1 to 9 record choices `PLAN.md` and `CLAUDE.md` made before any code existed. Decisions 10 and 11 came with the nightly-loop setup.

---

### 1. Plain Vite and TypeScript, no framework

The article is mostly static prose, with small interactive islands in it. A widget's whole lifecycle is `mount(el, opts)` returning an unmount function. A framework would add runtime weight and a dependency to do what that one function already does, and every frame spent in a framework comes out of the 4 ms budget. Vite gives a dev server and a production build, and adds nothing to the page.

### 2. The simulation is pure, and runs under Node unchanged

`src/sim` has no DOM, no timers, and no unseeded randomness. The physics tests, the headless CLI, and the browser therefore all run the same code, and the physics can be tested without a browser. Scenarios are reproducible to the bit (test 8), which is what makes a failing physics test debuggable at all.

### 3. One animation loop, owned by the scheduler

Widgets register tick callbacks, and they never call `requestAnimationFrame` themselves. Global pause, offscreen pausing, and `prefers-reduced-motion` are then implemented once, and can't be forgotten by any widget. It also gives the frame budget in M9 one place to be measured.

### 4. Two simulation modes, kept honest by a test

Detailed mode steps at 2 to 4 kHz, which is what anything drawing individual rotations or coil waveforms needs. At that rate, 72 hours is on the order of a billion steps, which no browser tab should do. Averaged mode covers hours-to-days timescales in a quasi-steady model. The two could drift apart silently, so test 7 requires them to agree on mean rotor speed and rate error over a shared window.

### 5. Parameters are derived as a system, and labelled

The 9R's torque curve, inertias, coil constants, and capacitor values are not public. Guessing each one independently gives a model that fails to hit the published anchors (8 rev/s, 72 h, ±15 s/month). They are therefore derived in order, so the whole set is self-consistent with those anchors. Every value is labelled published, derived, or assumption in `PHYSICS.md`, and the article must present assumed numbers as modelled.

### 6. The regulator models the principle, not the firmware

Seiko's control law is not public. The model compares rotor pulses against the divided quartz reference and sets brake duty with a discrete PI controller, clamped to [0, 1]. The article says so. Claiming more would break priority 1 in `CLAUDE.md`.

### 7. Canvas 2D or SVG; three.js only for the optional 3D view

The widgets are diagrams and plots, and 2D is enough for them. three.js is a large dependency, so it is allowed only in `movement-3d` (M10), which is optional.

### 8. No runtime network requests, including fonts

`PLAN.md` puts analytics, cookies, and runtime network requests out of scope. A font from a CDN is a runtime request, so Jost is self-hosted from the build output. M0 adds an e2e test that fails on any request to another origin, so this is enforced rather than remembered.

### 9. One milestone-sized pull request per night

Work lands as one PR a night, reviewed by Nathan in the morning. The constraint is the point: it keeps `master` deployable and keeps a human on every change.

The same loop on another project (`eks-wrangler`) learned two lessons, and this setup adopts both from the start. First, a line-count target measures the wrong thing. Tests run several times the length of the code they cover, so a cap on the total diff made the loop split work on the count rather than at a seam. It shipped half a thought one night and the other half the next. There is no line target here. Second, the failure mode is taking too little, not too much. A "follow-up" that only finishes what tonight's PR started is not a follow-up. See `CLAUDE.md`, "What one pull request means".

### 10. CI waits for the scaffold

CI was added before any code existed, and until M0 lands there is no `package.json` to install from. The workflow's `scaffold` job checks for one. The real jobs depend on it and are skipped, not failed, when it is missing, so `master` is not red between the setup PR and M0. The gate is temporary. M0's acceptance criteria require deleting it, after which nothing in CI can be skipped because a file is missing.

### 11. Cloud sessions use the preinstalled Chromium

The nightly loop runs in a cloud container that ships Chromium at `/opt/pw-browsers`, where `playwright install` should not be run. The browser revision `@playwright/test` expects can differ from the one installed. So the session-start hook exports `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium` when that file exists, and `playwright.config.ts` passes it as the executable path. CI does not set the variable, and installs the browser Playwright pins, as usual.
