# Decisions

Short records of choices that would otherwise get re-litigated. Add them as they are made. When one is reversed, amend it rather than deleting it, so the history of why stays readable.

A physical parameter is not a decision. It goes in `PHYSICS.md`. A decision belongs here when it is about how the model or the site is built: an integrator, a control law's update rate, a dependency, a test strategy.

Decisions 1 to 9 record choices `PLAN.md` and `CLAUDE.md` made before any code existed. Decisions 10 and 11 came with the nightly-loop setup. Decisions 12 to 18 came with M0. Decisions 19 to 22, and an amendment to 6, came with M1. Decisions 23 and 24 came with M2. Decisions 25 and 26 answered the maintainer's open questions after M2.

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

*Amended in M1 (2026-09-26):* the controller is PI on phase plus a speed term, making it a PID. `PLAN.md` offered PI as "a reasonable starting point", and with this plant it was not enough. Duty-to-torque gain is high (the shorted coil has 9× the brake the spring ever needs), and a PI loop on phase is two integrators behind a lag. At low wind, where the steady duty and so the brake's damping are smallest, it rang, and the best PI gains took 10 to 20 s to lock. The speed term is the phase change over the last reference period, which an IC can measure by counting rotor pulses against the reference, so it adds nothing the real hardware could not have. With it, the worst-case lock is about 4 s. The gains and the search that chose them are in `PHYSICS.md`, D6.

### 7. Canvas 2D or SVG; three.js only for the optional 3D view

The widgets are diagrams and plots, and 2D is enough for them. three.js is a large dependency, so it is allowed only in `movement-3d` (M10), which is optional.

### 8. No runtime network requests, including fonts

`PLAN.md` puts analytics, cookies, and runtime network requests out of scope. A font from a CDN is a runtime request, so Jost is self-hosted from the build output. M0 adds an e2e test that fails on any request to another origin, so this is enforced rather than remembered.

### 9. One milestone-sized pull request per night

Work lands as one PR a night, reviewed by the maintainer in the morning. The constraint is the point: it keeps `master` deployable and keeps a human on every change.

The same loop on another project (`eks-wrangler`) learned two lessons, and this setup adopts both from the start. First, a line-count target measures the wrong thing. Tests run several times the length of the code they cover, so a cap on the total diff made the loop split work on the count rather than at a seam. It shipped half a thought one night and the other half the next. There is no line target here. Second, the failure mode is taking too little, not too much. A "follow-up" that only finishes what tonight's PR started is not a follow-up. See `CLAUDE.md`, "What one pull request means".

### 10. CI waits for the scaffold

CI was added before any code existed, and until M0 lands there is no `package.json` to install from. The workflow's `scaffold` job checks for one. The real jobs depend on it and are skipped, not failed, when it is missing, so `master` is not red between the setup PR and M0. The gate is temporary. M0's acceptance criteria require deleting it, after which nothing in CI can be skipped because a file is missing.

*Amended in M0 (2026-09-25):* the `scaffold` job and the `needs`/`if` lines that pointed at it are deleted. Every check now runs on every PR.

### 11. Cloud sessions use the preinstalled Chromium

The nightly loop runs in a cloud container that ships Chromium at `/opt/pw-browsers`, where `playwright install` should not be run. The browser revision `@playwright/test` expects can differ from the one installed. So the session-start hook exports `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium` when that file exists, and `playwright.config.ts` passes it as the executable path. CI does not set the variable, and installs the browser Playwright pins, as usual.

### 12. Prettier formats code, not prose

Prettier checks TypeScript, JavaScript, CSS, JSON, and YAML. It skips Markdown and `index.html`. Those files are hand-written prose: the maintainer's article, and the project's docs. Prettier would reflow paragraphs and realign tables, so a one-word edit would become a noisy diff, and it would reformat the maintainer's writing without being asked. The code style is Prettier's default with single quotes and a 120-column line, in `.prettierrc.json`.

### 13. Jost comes from `@fontsource/jost`, bundled at build time

Decision 8 needs Jost served from the build output. `@fontsource/jost` is the standard npm packaging of the Google Fonts files, under the SIL Open Font License. Vite copies the `woff2` and `woff` files it references into `dist/assets`, with content hashes. It is listed under `dependencies`, because its files ship to readers, but it adds no JavaScript to the page. Only the Latin subset is loaded, in weights 400, 400 italic, and 600, which comes to about 31 kB of `woff2`. A symbol outside Latin (τ, Ω) falls back to the system sans. `assetsInlineLimit: 0` keeps the fonts as files rather than `data:` URIs inside the CSS. A vendored copy would work equally well, but it would leave nobody to notice upstream fixes.

### 14. The scheduler: one tick rule, a clamped step, and an idle loop

Three choices in `src/runtime/scheduler.ts` decide how every widget behaves in time:

- **Whether a widget ticks is one pure function**, `shouldTick`, of global pause, visibility, reduced motion, and the widget's own play request. Global pause and being offscreen always win. Under reduced motion a widget draws a static frame, and the play button is the reader's consent to animate that one widget. Vitest covers all 16 combinations, written out as a table rather than computed.
- **The step is clamped to 0.1 s**, and the first frame after the loop starts steps zero. A tab returning from the background therefore resumes where it left off, instead of replaying minutes of simulation in one frame. The article's clock loses the time nobody was watching. That is what a reader expects, and it keeps detailed mode's integrator (M1) from ever seeing a huge `dt`.
- **The loop stops when nothing ticks.** With every widget offscreen, paused, or static, no frames are requested at all. That is how "an offscreen widget costs nothing" (CLAUDE.md, priority 2) holds for the page as a whole.

The browser is injected (`SchedulerEnv`), so tests drive frames, visibility, and reduced motion by hand, with no wall clock.

### 15. The palette is TypeScript, inlined into the page as CSS at build time

The part colours have to agree between prose (`span.part`) and widgets (canvas strokes). `src/runtime/palette.ts` is the only place they are defined. Widgets read the tokens directly. A small Vite plugin writes `paletteCss()` into `<style id="palette">` in `index.html`, as CSS custom properties with a `prefers-color-scheme: dark` block, so the prose is coloured on first paint, before any script runs. Every part colour clears WCAG AA for body text (4.5:1) on both the page background and the widget surface, because it is used as a text colour. A Vitest test checks every pair.

### 16. End-to-end tests run against the production build

`npm run test:e2e` builds, then runs Playwright against `vite preview`. The page the tests see is the page readers get, and that is what proves the fonts come from `dist` and no request leaves the origin. The build takes well under a second, so `npm run check` building twice costs nothing worth saving. Playwright never reuses a server that is already running, because a stale preview would test an older page.

### 17. Widget DOM tests use happy-dom, opted into per file

Mounting and unmounting a widget, and checking that the scheduler is left with nothing registered, is widget logic that does not need a real browser. Those tests run in Vitest under `happy-dom`, opted into with a `@vitest-environment` comment at the top of the file. The physics and runtime tests stay on plain Node, where `src/sim` has to run. happy-dom has no canvas context, so widgets have to skip drawing when `getContext` returns null, which keeps them robust in any case.

### 18. Architectural rules are proven by fixtures that must fail

The ESLint rules enforcing the hard boundaries, and the DOM-free `tsconfig` for `src/sim`, are each proven by fixture files under `tests/lint/fixtures` and `tests/types/fixtures`. Vitest lints or typechecks each fixture as if it lived at a real path (`// lint-as: src/sim/fixture.ts`), and asserts that the expected rule fires. A control fixture checks that the scheduler's own exemption works. Without these, a misconfigured rule or an ESLint upgrade that changed a rule's matching would pass every build silently.

### 19. Detailed mode steps at 4,096 Hz, and the regulator updates on the crystal's 8 Hz tick

`PLAN.md` asks for a fixed step of 2 to 4 kHz and for the regulator's update rate to be chosen and recorded.

- **Step: 2⁻¹² s.** It is 8 crystal cycles, so the IC's cycle count advances by a whole number every step, and a reference tick (4,096 cycles) falls exactly on every 512th step. Time is the step count times the step, exact in binary, so neither time nor the reference phase ever accumulates rounding. The fastest thing the model resolves is the capacitor charging through the coil (RC = 10 ms, 41 steps), and the wheel's mechanical time constant is 0.625 s, so semi-implicit Euler is stable with a wide margin. RK4 would buy nothing visible, at four times the cost.
- **Regulator: once per reference tick, 8 Hz, clocked by the crystal.** Not once per rotor revolution. Both are 8 Hz when locked, but a tick-clocked controller keeps running at the same rate when the wheel is slow, stalled, or overspeeding, which is exactly when it matters. It also gives the loop a fixed sample period, which is what the gains were tuned for. The measured phase error is the wheel's exact angle against the reference. A real IC would see it only as whole rotor pulses; with the rotor at 8 rev/s and the reference at 8 Hz, the difference is below anything a widget could draw.
- **Power-on aligns the reference to the wheel.** When the IC starts, its counters start from zero, so the reference begins wherever the wheel happens to be. A widget that turns regulation back on after a runaway calls `realignReference`, which does the same, so that the loop does not try to repay every turn the wheel ran ahead while unregulated.

### 20. The generator is modelled by its rectified mean, and the brake by its duty-averaged current

The coil's EMF is AC, and the brake switch chops far faster than the wheel's speed can change. The dynamics use the averages over both: e = k_e·ω is the rectified-mean EMF, and the coil is shorted for a fraction `duty` of the time and charges the capacitor for the rest. That is `PLAN.md`'s τ = k_e²·ω/R_eff with R_eff = R/duty, plus a charging path through a rectifier with a fixed drop. The generator widget (M4) will want the AC waveform itself. A pure function giving the instantaneous EMF from the wheel's angle, whose rectified mean is k_e·ω, belongs in `generator.ts` when that widget needs it. It changes nothing in the dynamics.

### 21. Physics tests assert the numbers PHYSICS.md states, exactly where the model is deterministic

`PHYSICS.md` has a **Model predictions** table: the runaway speed, the lock times, the steady duties, the relock bound. The physics tests assert those values, not looser ones. Lock times are asserted exactly. They are multiples of the 0.125 s reference period, and the simulation is deterministic (decision 2), so a change that moves one by a period is a change in the physics, and has to move `PHYSICS.md` with it. Continuous values get tolerances, each with a comment saying why it is that wide. The parameter tables themselves are checked mechanically: `tests/sim/params-coverage.test.ts` fails if any constant exported from `params.ts` lacks a row, if a row names a constant that does not exist, if a label is not one of the three, or if a value disagrees with the code to the digits shown.

### 22. Energy is booked term by term, not as a remainder

Test 5 would prove nothing if one ledger term were computed as whatever balances the rest. Every flow is booked from its own formula as it happens: spring energy from the exact area under the torque curve; train loss as its efficiency share; friction as torque times angle; coil and rectifier heat from I²R and the drop; the IC as power times time; and shocks as their change in kinetic energy. Kinetic and capacitor energy are state, not ledger. The residue, of order dt·Δω per step, comes from booking mechanical terms at each step's mean speed and electrical ones at its start. It measures under 3 parts in 10⁶, and the test allows 1 in 10⁵.

### 23. Averaged mode is quasi-steady, with its events located exactly

`PLAN.md` asks for a quasi-steady model, per rotation or per second, for hours to days. `src/sim/averaged.ts` takes steps of at most 1 s (`AVERAGED_STEP_S`), and in each one puts the glide wheel at the speed where its torques balance and the capacitor where its currents balance. Everything it skips settles within a second or a few: the wheel's mechanical time constant is 0.625 s, the capacitor's RC is 10 ms, and a lock takes about 4 s. The alternatives were a per-rotation model, which is the same thing at an eighth of a second and eight times the cost, and detailed mode with a coarser step, whose explicit capacitor update goes unstable past a step of twice its 10 ms RC, long before it is cheap.

- **Five regimes, not one formula.** Regulated, catching up, holding back, free, and stalled (PHYSICS.md, D7). The regulated point is solved in closed form, as a quadratic in the capacitor voltage. The others need a speed, and bisection finds it, bracketed below by the friction minimum or the slowest speed the IC survives, and above by (drive − τ_c)/b.
- **Thresholds are solved for, not stepped over.** Phase error returning to zero, and a draining capacitor reaching brownout, happen at times that are solved for exactly, and the step is split there. The step size therefore sets only how finely the spring's unwinding is followed, not where events fall. One 10 h call and 36,000 one-second calls give identical physics, which is what a widget with time acceleration and a tab returning from the background both need.
- **Holding back is modelled, not assumed away.** A wheel far ahead of the reference, as after the brake is re-enabled following a runaway, is braked at full duty while the IC runs off the capacitor, until it falls back or the capacitor browns out. That is what detailed mode does (the 25 s hold-back and relock that `tests/sim/averaged.test.ts` compares against it), so averaged mode needs no special realignment rule.
- **Predictor-corrector on the drive.** Each step finds its operating point twice: once at the drive at the step's start, then again at the mean drive over the angle the first estimate turns through, which is the exact spring energy released per radian. The ledger then closes to 1 part in 10⁹ over a full run-down, where the start-of-step torque alone leaves 1.3 parts in 10⁶ (measured).
- **The ledger books steady flows only.** Kinetic energy and the capacitor's charge change in jumps between regimes. Those jumps are transients, which averaged mode does not resolve, so no ledger term books them, and the energy balance in test 4 compares the spring against the losses alone. The largest such jump, a runaway wheel's ½Jω², is 2 × 10⁻⁶ J against the spring's 0.52 J.
- **No shocks.** A shock lasts milliseconds, and its effect a few seconds. Averaged mode takes none, and `AveragedScenario` has no field for them. A widget that shows a shock uses detailed mode.
- **Cost.** A few microseconds a step under Node on the build container (3 to 9 µs, depending on the regime and on JIT warm-up), so a 72 h run-down takes well under a second. At that rate, the 4 ms frame budget allows about 1,000 steps a frame, or about 17 h of sim time per second of real time at 60 frames a second. M8 decides how fast its time acceleration goes, knowing that ceiling.

Test 7 keeps the two modes honest. It starts both from the same detailed state (`averagedFromDetailed`) and measures their difference over shared windows. It also checks that each difference is the one this decision predicts: the leftover phase error when regulated, and the quasi-steady lag when not.

### 24. The scenario CLI: tsx, CSVs with units in the headers, and CI runs every scenario

`npm run sim -- <scenario>` runs `tools/sim-cli.ts` with `tsx`, a dev dependency, which is the standard way to run TypeScript under Node without a build step. Node's own type stripping would also run this code, but it is on by default only in recent 22.x releases, and `package.json` allows any Node from 22.12. The scenarios are defined in `tools/scenarios.ts` and the CSV format in `tools/csv.ts`. Both are plain modules, tested in Vitest without spawning a process. The CLI itself is a `main(argv, io)` that returns its exit code, so its error paths are tested directly, plus one spawn of `npm run sim` to prove the wiring.

- **Units in every header.** Each column name ends in its unit: `_s`, `_rad`, `_rad_s`, `_rev_s`, `_V`, and, for dimensionless columns, `_fraction` (0 to 1) or `_flag` (0 or 1). A test enforces it. Numbers are written in full (`String(n)`), so a CSV reads back to the bit and a diff between two runs means the physics changed.
- **`hand_error_s`** is what the hands show minus true time: the glide wheel's angle read at 8 rev/s, against the clock. It is the rate, integrated, and the column a reader wants from `rate-24h`.
- **CI runs `npm run sim -- all`**, and so does `npm run check`, straight after the unit tests. That catches a scenario that throws before merge. The output goes to `tools/out/`, which git ignores; the runs are reproducible from the scenario name (decision 2), so there is nothing to keep.
- **An unknown scenario exits 2** and lists the valid names with a line on each. The exit code is 2, not 1, following the usual convention for a usage error.

### 25. Widget screenshots reach a PR as the CI run's `screenshots` artifact, not as committed files

The maintainer's answer to the open question raised with M2. CI's `e2e` job already uploads `test-results/screenshots/` as a `screenshots` artifact on every run, whether or not the tests passed, and keeps it for 30 days. That is how widget work is reviewed. Screenshots are not committed under `docs/screenshots/` or anywhere else, so the history carries no binary churn, and what the reviewer sees is always what the test produced on that head, never a stale copy. The cost is a download per review, which the maintainer accepted. The PR description names each file in the artifact and says what it shows (`.github/pull_request_template.md`), and the nightly session still opens every screenshot itself before writing the PR.

### 26. The model's crystal stays exact: no frequency offset

The maintainer's answer to the open question raised with M2. The quartz runs at exactly 32,768 Hz, and there is no `QUARTZ_OFFSET_PPM` parameter, so while regulated the model's rate error is 0 s/day (PHYSICS.md, D7). A real watch crystal's cut tolerance and temperature drift are what the 9R's rated ±15 s/month mostly allows for, but no published 9R figure gives them, and an invented ppm would put an unsourced number in front of the reader.

- **What the article may say.** The loop adds no rate error of its own: it holds the glide wheel to the crystal, so the watch is exactly as accurate as its crystal. The model's zero is a property of the model's perfect crystal. It must never be presented as the 9R's accuracy. Wherever a rate appears, in prose or a widget, it is framed that way, and the published ±15 s/month is attributed to the real movement, crystal and all.
- **What widgets may show.** A rate readout (M8, if it has one) shows the model's rate, and next to it says what that rate leaves out. It does not add a crystal error of its own, as a hidden default or as a reader control. Changing either would need a new decision.
- **Test 3 stays as it is.** It asserts 0 s/day to float rounding. That meets `PLAN.md`'s ±0.5 s/day trivially, and the test says so.
