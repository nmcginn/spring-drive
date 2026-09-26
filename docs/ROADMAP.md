# Roadmap

The backlog for the nightly loop. Each task is a milestone from `PLAN.md` and is one pull request. Tasks are in priority order: take the first unchecked task whose **Needs** have all merged and that is not waiting on an open question.

Each task lists its checklist and acceptance criteria. A task is done when those hold, tests cover them, and `npm run check` passes. Tick the box in the same PR that implements it, and move a one-paragraph summary to **Done**.

If a task turns out to be larger than one PR, land the smallest **complete** slice (one a reader or the reviewer meets as a finished change), tick nothing, and split the rest into new tasks here. Split at a seam: a surface this PR does not touch, such as another widget or a sim module nothing uses yet, or a decision the maintainer should make first. An entry that exists only because the last change stopped short of the bar in `CLAUDE.md` is not a follow-up. It is unfinished work, and it belongs in the PR that raised it.

---

## Status

Update this at the end of every session.

- Current milestone: M2 (in review). M0 merged as #2, M1 as #5.
- Last session: 2026-09-26, M2 averaged mode and CLI
- Open PRs waiting on review: the M2 PR (`nightly/2026-09-26-m2-averaged-cli`)
- Next up: M3 (`runaway` and `hero-glide`). It needs only M1, which has merged, so it branches from `master` while M2 is in review. M4 to M7 are equally eligible. M8 needs M2, and may stack on its branch, one deep. M3 is the first widget, so the screenshots question below becomes live with it.

## Open questions for the maintainer

Questions the nightly loop could not answer without guessing at physics, architecture, or the article's structure. Each one names the task it blocks. When the maintainer answers, record the answer in `docs/DECISIONS.md`, add a *Decided* note to the task pointing at it, and delete the question here.

- **How should widget screenshots reach a pull request?** (First needed by M3.) CLAUDE.md requires screenshots for widget work. By default, CI's `e2e` job uploads them as a `screenshots` artifact on the run, and the PR description says which files to look at. That means downloading a zip to review. The alternative is committing them under `docs/screenshots/<milestone>/`, so they render inline in the PR's diff, at the cost of binary churn in the history. Until this is answered, the nightly loop uses the CI artifact.
- **Should the model's crystal have a frequency error?** (Blocks nothing yet; first matters for M8, if it shows a rate readout.) The model's quartz runs at exactly 32,768 Hz, so while regulated its rate error is zero (PHYSICS.md, D7), and test 3's ±0.5 s/day is met trivially. Real watch crystals are cut to a tolerance of some parts per million and drift with temperature, and that, not the loop, is what a rated ±15 s/month mostly allows for. A `QUARTZ_OFFSET_PPM` assumption would make the rate readout say something, at the cost of a number with no published 9R source. Until this is answered, the crystal stays exact and the article must not present the model's zero as the 9R's accuracy.

---

## M0: Scaffold

- [x] **Scaffold the site, the checks, and the runtime.**
  *Needs:* nothing.
  - Vite + strict TypeScript, ESLint, Prettier
  - Vitest and Playwright wired into `npm test` and `npm run test:e2e`
  - `scheduler.ts` with global pause, offscreen pausing, reduced motion
  - `palette.ts` with light and dark themes
  - Placeholder widget mounted in `index.html`
  - Cloudflare Pages build config (`npm run build`, output `dist`)

  *Acceptance:*
  - All checks pass. The placeholder widget animates, pauses offscreen, and passes the smoke test. The smoke test proves the offscreen pause, not just the mount: scroll the widget away and its tick count stops advancing, then scroll it back and it resumes.
  - `npm run check` runs every gate CI runs, fastest first: `typecheck`, `lint`, `format:check`, `test`, `build`, `test:e2e`. It is the single command CLAUDE.md points at.
  - CI's `scaffold` gate job in `.github/workflows/ci.yml` is deleted, so every check runs on every PR from here on (see decision 10). The Node version lives in `.nvmrc`, which CI reads.
  - The hard boundaries are enforced by tooling, not just stated. `src/sim` is typechecked under its own `tsconfig` without the DOM lib. ESLint stops `src/sim` from importing `runtime` or `widgets`, from using timers, and from using `Math.random`. It also stops any module except `runtime/scheduler.ts` from calling `requestAnimationFrame`. Each rule is proven by a fixture file that must fail lint.
  - Whether a registered widget ticks is a pure function of global pause, visibility, and reduced motion, and Vitest covers every combination. Under reduced motion the widget renders a static frame and a play button.
  - `palette.ts` follows `prefers-color-scheme`. The placeholder widget reads its colours only from palette tokens.
  - Playwright runs a mobile project (380 px wide, touch enabled) and a desktop project. Screenshots are written to `test-results/screenshots/`, which is the path CI uploads. `playwright.config.ts` passes `PLAYWRIGHT_CHROMIUM_PATH`, when set, as the Chromium executable path, so cloud sessions use their preinstalled browser (see decision 11).
  - An e2e test fails on any request to an origin other than the page's own, because runtime network requests are out of scope. That includes fonts: Jost is served from the build output, not a font CDN. How it gets there (a vendored file or `@fontsource/jost`) is flagged in the PR as a dependency.
  - The README says how to connect the repository to Cloudflare Pages: build command, output directory, Node version.

## M1: Sim core and PHYSICS.md

- [x] **Detailed-mode simulation, fully parameterised and derived.**
  *Needs:* M0.
  - All `src/sim` modules for detailed mode
  - `params.ts` fully populated, every value traced to PHYSICS.md
  - Tests 1, 2, 5, 6, 8 from `PLAN.md`'s "Required physics tests"

  *Acceptance:*
  - Tests pass and PHYSICS.md explains every derived number. Every constant in `params.ts` has a PHYSICS.md row with its label (published, derived, or assumption). A test fails if a constant is added to `params.ts` without a matching row, so this does not rest on review.
  - The derivation follows PLAN.md's suggested order, and PHYSICS.md shows the arithmetic, so the reviewer can check each number with a calculator.
  - The lock time from test 2 is stated in PHYSICS.md, and the test asserts that stated value rather than a looser one.
  - The regulator's update rate (once per rotor revolution, or a fixed rate) is chosen and recorded in `docs/DECISIONS.md`, as PLAN.md asks.
  - The IC power figure cites a source, or is labelled as an assumption if none could be found. That is flagged in the PR either way.
  - Each tolerance in a physics test has a comment saying why it is that wide.

## M2: Averaged mode and CLI

- [x] **Averaged mode, the headless scenario runner, and the long-horizon tests.**
  *Needs:* M1.
  - `averaged.ts`
  - `tools/sim-cli.ts` with scenarios: `full-wind-lock`, `runaway`, `rate-24h`, `rundown-72h`, `shock`
  - Tests 3, 4, 7 from `PLAN.md`'s "Required physics tests"

  *Acceptance:*
  - The CLI writes CSVs for every scenario, and all physics tests pass.
  - `npm run sim -- <scenario>` writes to `tools/out/`, which git ignores. An unknown scenario name exits non-zero and lists the valid names.
  - CI runs every scenario, so a scenario that throws is caught before merge rather than the first time someone runs it.
  - Each CSV's columns are named with units (`omega_rad_s`, `v_cap_V`), so the files are readable without the source.

## M3: `runaway` and `hero-glide` widgets

- [ ] **The intro's gliding hand, and the unregulated rotor.**
  *Needs:* M1.
  *Acceptance:* the widget done-when below, for both widgets.

## M4: `generator` widget

- [ ] **Rotor speed drives the EMF waveform.**
  *Needs:* M1.
  *Acceptance:* the widget done-when below.

## M5: `lenz-brake` widget

- [ ] **Coil load sets braking torque and spin-down.**
  *Needs:* M1.
  *Acceptance:* the widget done-when below.

## M6: `quartz` widget

- [ ] **32,768 Hz divided down to the 8 Hz reference.**
  *Needs:* M1.
  *Acceptance:* the widget done-when below.

## M7: `loop` widget

- [ ] **Regulation on and off, shocks, the phase-error scope, and brake duty.**
  *Needs:* M1.
  *Acceptance:* the widget done-when below.

## M8: `tri-synchro` widget

- [ ] **The full system with time acceleration, power reserve, and rundown to brownout.**
  *Needs:* M2.
  *Acceptance:* the widget done-when below.

### Widget done-when (M3 to M8)

These come from `PLAN.md`, and the Playwright test is what proves them.

- The widget meets every requirement in `PLAN.md`'s widget list. It mounts via `mount(el, opts)` and returns an unmount function. It uses palette tokens only. It works at 380 px with touch. It respects global pause and reduced motion. Every readout has units.
- It has a Playwright test that mounts it, interacts with its primary control, asserts no console errors, and attaches a screenshot at mobile and desktop widths.
- Unmount releases everything: after unmount the scheduler has no callback registered for the widget, and remounting works.
- Any logic in the widget other than drawing is a pure function with Vitest tests. That covers mapping sim state to geometry, formatting readouts, and mapping control positions to parameters. Widgets do not implement physics.
- The widget's slot in `index.html` sits in its section from `PLAN.md`'s outline, next to a `<!-- PROSE: ... -->` stub saying what the text there needs to explain. Part names near it are wrapped in `<span class="part" data-part="...">`.
- The nightly session has looked at every screenshot itself before writing the PR, and the PR says what each one shows.

## M9: Polish

- [ ] **Palette consistency, the frame budget, keyboard access, and sharing metadata.**
  *Needs:* M3 to M8.
  - Consistent palette usage across prose and widgets
  - Performance budget: all visible widgets together stay under 4 ms of main-thread time per frame on a mid-range laptop
  - Keyboard access for all controls, ARIA labels on sliders
  - Open Graph image and meta tags

  *Acceptance:* each item above holds. How the frame budget is measured is recorded in `docs/DECISIONS.md`, and so is what CI can and cannot prove about it, since a CI runner is not a mid-range laptop. These four items touch different surfaces, so this is the one milestone expected to split. Split it along those lines.

## M10 (optional): `movement-3d`

- [ ] **Draggable 3D view of the movement.**
  *Needs:* M9, and the maintainer saying it is wanted. Do not start this on the loop's own initiative.
  *Acceptance:* the widget done-when above. three.js is the one runtime dependency this widget is allowed, and it loads only when the widget's slot comes near the viewport.

---

## Done

Newest first. One paragraph per task: what landed, the date, and the decisions it added.

- **M2: Averaged mode and CLI** (2026-09-26). `src/sim/averaged.ts`: a quasi-steady mode in steps of up to 1 s. The glide wheel sits where its torques balance and the capacitor where its currents balance, in one of five regimes: regulated (solved in closed form), catching up, holding back, free, and stalled. Phase error returning to zero and a capacitor browning out are located exactly within a step, so one 10 h call equals 36,000 one-second ones. A full 72 h run-down takes well under a second. Physics tests 3 (rate: 0 s/day while regulated, because the crystal is exact; see the open question), 4 (regulation for 70.645 h, brownout at 70.848 h and 6.433 rev/s, stall at 73.725 h, and the energy ledger closes to 10⁻⁹), and 7 (the modes agree to 10⁻⁶ in speed and 0.02 s/day in rate while regulated, and to 2 × 10⁻⁴ unregulated, each gap explained and measured) pass. `npm run sim -- <scenario>` writes a CSV with units in every header for `full-wind-lock`, `runaway`, `rate-24h`, `rundown-72h`, and `shock`. CI and `npm run check` run all five. `tsx` is a new dev dependency. PHYSICS.md gains `AVERAGED_STEP_S`, derivation D7, and the run-down predictions. Decisions 23 and 24.
- **M1: Sim core and PHYSICS.md** (2026-09-26). All of detailed mode in `src/sim`: mainspring (a piecewise-linear torque curve with exact stored energy), train, glide wheel (Coulomb, viscous, and Stribeck friction, so a dying spring stalls the wheel rather than letting it crawl for hours), generator (rectified-mean EMF, duty-averaged brake and charging paths), capacitor and IC (constant power, brownout with restart hysteresis), quartz divider (integer-counted, exact over 72 h), a PID regulator on the crystal's 8 Hz tick, a 4,096 Hz semi-implicit Euler stepper with a term-by-term energy ledger, lock metrics, and seeded shocks. `PHYSICS.md` derives every parameter in `PLAN.md`'s order, with the arithmetic, a table of model predictions the tests assert, and the 72 h energy budget. Physics tests 1, 2, 5, 6, and 8 pass, with every tolerance explained. The full-wind lock time (3.75 s) is asserted exactly. A coverage test ties every `params.ts` export to its `PHYSICS.md` row, label, and value. The IC's 25 nW is labelled an assumption, because its sources could not be opened from the build container. Decisions 19 to 22, and an amendment to 6 (PI became PID).
- **M0: Scaffold** (2026-09-25). Vite 8 and strict TypeScript 6, ESLint 10 with typescript-eslint, Prettier, Vitest 5, and Playwright 1.63, all behind `npm run check`. `src/runtime` has the scheduler (one loop, global pause, offscreen pause through IntersectionObserver, reduced motion with a per-widget Play button, a clamped step, and a loop that idles when nothing ticks), the light and dark palette (inlined into `index.html` at build time, with every part colour at WCAG AA for text), a HiDPI canvas, and button helpers. A placeholder widget proves it all end to end, on a 380 px touch project and a desktop project. Lint and a DOM-free `tsconfig` enforce `src/sim`'s purity and the scheduler's monopoly on `requestAnimationFrame`, each proven by a fixture that must fail. Jost is bundled from `@fontsource/jost`, and an e2e guard fails any test that makes an off-origin request. CI's `scaffold` gate is gone. The index page has the article's section skeleton with PROSE stubs, and a footnote crediting Bartosz Ciechanowski's *Mechanical Watch* as the inspiration, at the maintainer's request. Decisions 12 to 18, and an amendment to 10.

## Ideas, not yet scheduled

Pull these up into a milestone when the maintainer decides they are the most valuable next thing.

- (none yet)
