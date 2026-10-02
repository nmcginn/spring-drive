# Roadmap

The backlog for the nightly loop. Each task is a milestone from `PLAN.md` and is one pull request. Tasks are in priority order: take the first unchecked task whose **Needs** have all merged and that is not waiting on an open question.

Each task lists its checklist and acceptance criteria. A task is done when those hold, tests cover them, and `npm run check` passes. Tick the box in the same PR that implements it, and move a one-paragraph summary to **Done**.

If a task turns out to be larger than one PR, land the smallest **complete** slice (one a reader or the reviewer meets as a finished change), tick nothing, and split the rest into new tasks here. Split at a seam: a surface this PR does not touch, such as another widget or a sim module nothing uses yet, or a decision the maintainer should make first. An entry that exists only because the last change stopped short of the bar in `CLAUDE.md` is not a follow-up. It is unfinished work, and it belongs in the PR that raised it.

---

## Status

Update this at the end of every session.

- Current milestone: M9d (sharing metadata), in review. With it, M9 is done. M0 merged as #2, M1 as #5, M2 as #6, M3 as #8, M4 as #9, M5 as #10, M6 as #11, decision 35 as #12, M7 as #13, M7b as #14, M8 as #15, the loop e2e fix as #16, M9a as #17, M9b as #18, and M9c as #19.
- Last session: 2026-10-02, M9d: Open Graph and X tags, a share card drawn from the palette and the widgets' own drawing code, the glide wheel's magnet as the favicon (SVG, ICO, and a home-screen icon), and the build making the sharing URLs absolute from `SITE_URL` or Cloudflare's `CF_PAGES_URL`. Decision 42. No new parameter.
- Open PRs waiting on review: M9d.
- For the maintainer, not blocking anything: once the site has its public address, set `SITE_URL` in Cloudflare Pages for Production (README, Deployment). Until then, previews show the card from each deployment's own address, and the page has no canonical URL.
- Next up: nothing the loop may start. Every milestone through M9 is done or in review. M10 waits on the maintainer saying it is wanted; until then, a night is best spent on review feedback, or on an idea below if the maintainer schedules one.

## Open questions for the maintainer

Questions the nightly loop could not answer without guessing at physics, architecture, or the article's structure. Each one names the task it blocks. When the maintainer answers, record the answer in `docs/DECISIONS.md`, add a *Decided* note to the task pointing at it, and delete the question here.

- (none open.)

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

- [x] **The intro's gliding hand, and the unregulated rotor.**
  *Needs:* M1.
  *Decided:* screenshots reach the PR as the CI run's `screenshots` artifact, named file by file in the description, and are not committed (decision 25). This holds for every widget milestone.
  *Acceptance:* the widget done-when below, for both widgets.

## M4: `generator` widget

- [x] **Rotor speed drives the EMF waveform.**
  *Needs:* M1.
  *Acceptance:* the widget done-when below.

## M5: `lenz-brake` widget

- [x] **Coil load sets braking torque and spin-down.**
  *Needs:* M1.
  *Acceptance:* the widget done-when below.

## M6: `quartz` widget

- [x] **32,768 Hz divided down to the 8 Hz reference.**
  *Needs:* M1.
  *Acceptance:* the widget done-when below.

## M7: `loop` widget

- [x] **Regulation on and off, shocks, the phase-error scope, and brake duty.**
  *Needs:* M1.
  *Decided:* the brake is the drawn sine's mean-square heat, with the coil's resistance raised so its figures did not move (decision 35). Brake duty and phase error are unaffected by M7b, so this can land before it.
  *Acceptance:* the widget done-when below.

## M7b: Peak-charging rectifier

- [x] **Charge the capacitor from the EMF waveform, not its mean.**
  *Needs:* M2.
  *Decided:* raised by the plausibility review in decision 35, and scheduled by the maintainer as its own task, before M8.
  - The charging current, in both modes, is what a rectifier with `RECTIFIER_DROP_V` delivers from the D9 sine through `COIL_RESISTANCE_OHM` into the capacitor: it conducts only while |e(θ)| exceeds the capacitor voltage plus the drop, and its mean over a cycle is a closed-form function of the peak and that threshold. The torque and heat follow from the same waveform, so the ledger still closes.
  - Averaged mode's regulated point, free regime, and brownout speed become the solutions of the new balance; where the closed-form quadratic no longer applies, solve numerically, and say in D7 how exactly.
  - D5, D7, D8, **Model predictions**, **Energy budget**, and the **Plausibility check** row for the supply voltage are rewritten from the new balance. The review's estimate, to be confirmed: about 1.34 V at 8 rev/s, brownout near 4.3 rev/s.

  *Acceptance:*
  - A test integrates the rectifier's current over a turn of the drawn waveform and checks it against the model's mean charging current, as `tests/sim/generator.test.ts` already does for the brake.
  - `IC_BROWNOUT_V` and `IC_START_V` are checked afresh: the run-down still ends with one clean brownout and no restart chatter. If they must change to keep that, that is a parameter change with its reasoning in PHYSICS.md, not a silent retune.
  - Every physics test passes with its stated value moved in PHYSICS.md, not its tolerance loosened. The regulator's gains still lock within the D6 criteria at full, mid, and low wind; if they need retuning, the grid search is rerun and recorded.
  - Merged widgets whose readouts move (the runaway's brownout and stop times, if any) are updated, with their e2e expectations, in the same PR.

## M8: `tri-synchro` widget

- [x] **The full system with time acceleration, power reserve, and rundown to brownout.**
  *Needs:* M2, M7b (the brownout it shows must be the waveform's; decision 35).
  *Decided:* the model's crystal is exact, so a rate readout, if the widget has one, shows 0 s/day while regulated and says beside it that the model's crystal is perfect and the 9R's ±15 s/month allows for a real one. No crystal offset, hidden or as a control (decision 26).
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

Split along its four items, as its acceptance asked, because they touch different surfaces: the runtime and every widget's cost, the palette in prose and widgets, the controls, and the page's head. Each is its own task below, and M9 is done when all four are.

- *Needs (all four):* M3 to M8.
- *Acceptance (all four):* each item holds.

### M9a: The frame budget

- [x] **All visible widgets together stay under 4 ms of main-thread time per frame on a mid-range laptop.**
  *Needs:* M3 to M8.
  *Acceptance:* how the frame budget is measured is recorded in `docs/DECISIONS.md`, and so is what CI can and cannot prove about it, since a CI runner is not a mid-range laptop (decision 39).

### M9b: Palette consistency

- [x] **Consistent palette usage across prose and widgets.**
  *Needs:* M3 to M8.
  *Acceptance:* the item holds. What "consistent" means, and how it is held, is decision 40.

### M9c: Keyboard access

- [x] **Keyboard access for all controls, and ARIA labels on sliders.**
  *Needs:* M3 to M8.
  *Acceptance:* the item holds. What "keyboard access" covers, and how it is held, is decision 41.

### M9d: Sharing metadata

- [x] **Open Graph image and meta tags.**
  *Needs:* M3 to M8.
  *Acceptance:* the item holds. `index.html`'s empty `data:` favicon is a placeholder waiting on this task. What the tags, the card, and the icons are, and how they are held, is decision 42.

## M10 (optional): `movement-3d`

- [ ] **Draggable 3D view of the movement.**
  *Needs:* M9, and the maintainer saying it is wanted. Do not start this on the loop's own initiative.
  *Acceptance:* the widget done-when above. three.js is the one runtime dependency this widget is allowed, and it loads only when the widget's slot comes near the viewport.

---

## Done

Newest first. One paragraph per task: what landed, the date, and the decisions it added.

- **M9d: Sharing metadata** (2026-10-02). A shared link now shows the article's title, its description, and a card: the title and description set in Jost beside a watch dial, with the glide wheel's magnet under its coil, drawn by the widgets' own drawing functions in the light palette (`public/og-image.png`, 1,200 × 630). The tags (`og:*`, `twitter:card`, a canonical link) are written by hand in `index.html`, and tests hold the Open Graph title and description equal to the page's own. The build makes their URLs absolute (`tools/head.ts`): the image from `SITE_URL`, or failing it Cloudflare's `CF_PAGES_URL`, so previews already unfurl; the page's own URL only from `SITE_URL`, and without it those tags are left out, so a preview never claims to be the article. M0's empty `data:` favicon is replaced by the glide wheel's magnet: an SVG in the palette's colours for either scheme, `favicon.ico` at 16, 32, and 48 px, and a 180 px home-screen icon. `npm run og-image` (`tools/og/`) draws the images in Chromium; they are committed, and a test fails, saying to re-render, when anything they are drawn from changes. `tests/e2e/sharing.spec.ts` checks the served files and the favicon's colours in both schemes, and `tests/tools/build.test.ts` runs a real build with `SITE_URL` set. With this, M9 is done. Decision 42.

- **M9c: Keyboard access** (2026-10-01). Every control was already a native button or range input, so each worked from the keyboard once it existed; the gaps were around them. Widgets mount lazily, and Tab passed by any that had not: on a page padded as the prose will be, Tab went from the intro straight to the footnote, past six widgets. Each slot is now a Tab stop until its widget mounts (`src/runtime/slots.ts`), and focus arriving there mounts it and moves on to its first control, or its last under Shift+Tab. The global pause button moved to the start of the document, so it is the first Tab stop rather than the last, though it still sits at the bottom right. `scroll-padding-bottom` stops Tab scrolling a control under that fixed button, which it did to the generator's slider at 380 px. Five buttons whose names did not contain their visible label now begin with it (WCAG 2.5.3), every slider has an ARIA label saying what it acts on, and the footnote's link has the page's focus ring. `tests/e2e/keyboard.spec.ts` walks the padded page with Tab and Shift+Tab at both widths, and drives toggles, sliders, and buttons from the keyboard alone. Decision 41, and an amendment to 32.

- **M9b: Palette consistency** (2026-09-30). An audit of every part colour the widgets use, and of every label they draw with its fill (recorded in a real browser), found five places where a thing was not the colour the prose gives it. Seconds hands were the glide wheel's blue, even on the intro's mechanical watch; every hand is now the hands' colour. Friction was the train's grey in tri-synchro and neutral in the brake widget; it is the wheel's own friction, so neutral in both. The brake widget drew the wheel's speed in the coil's red; it is the wheel's blue, as in the loop and tri-synchro. The reference was the crystal's violet in the loop and tri-synchro but the IC's teal in the quartz widget; it is violet throughout. And labels naming a part ("Glide wheel speed", "Mainspring", "IC: locking", "Glide wheel stops") were sometimes plain text; each now takes its part's colour. `src/widgets/shared/colours.ts` now says once which part each drawn thing belongs to, and lint stops a widget reading part colours any other way, or writing a colour literal. Readout labels carry their part in the prose's own markup, so the page's `.part` rule colours both and each readout is keyed to its trace. `tests/prose.ts` reads the prose's part names from `index.html`; Vitest checks the table and the readouts against them, and `tests/e2e/palette.spec.ts` checks every canvas label and readout on the page, in both colour schemes, at both widths. The runaway gains a dark-scheme screenshot. Decision 40, and amendments to 15 and 38.

- **M9a: The frame budget** (2026-09-29). The scheduler times every widget's tick and keeps the last four seconds (`src/runtime/budget.ts`). With `?budget` in the URL, a panel shows the mean, 95th percentile, worst, and share over 4 ms, and each widget's mean, with a Measure again button (`src/runtime/budget-overlay.ts`). That is how the budget is checked on a real laptop. `tests/e2e/budget.spec.ts` stops at each widget as a reader would, centred, in its most expensive state, at both widths, in projects that run after everything else and one at a time. It asserts that the widgets' mean tick time is under 4 ms, and so is the main thread's time less canvas rasterising, from Chrome's trace. CI writes every stop's figures into its run summary. The measurements found `mainspringEnergyJ` was O(N²) and called twice a step. It is now one pass, carried between steps, bit-identical, with every scenario CSV byte-identical. The loop's scope now strokes one path per run instead of 1,536. Together these took the widgets, all seven on screen at once, from 4.3 ms to about 2.7 ms a frame. The worst reader's stop, the desktop loop, measures about 2.5 ms. Decision 39.

- **M8: `tri-synchro` widget** (2026-09-28). The whole movement from full wind to a stop, in averaged mode, sped up: a minute, ten minutes, an hour, or two hours a second, from a slider, and a Skip button that jumps six hours, which is also how a reduced-motion reader steps through the reserve. A dial whose hands are geared to the glide wheel, with faint true-time hands; a panel of where the power reaching the wheel goes (at full wind 1.629 µW: 29.4% friction, 68.8% brake, 1.8% electricity); a power reserve gauge that reads the barrel; and a chart over 78 h of speed, supply, and brake duty. Regulation ends at 70 h 39 min, the IC browns out at 71 h 11 min at 4.275 rev/s (M7b's waveform brownout), and the wheel stops at 73 h 46 min with its hands at 71.73 h, 2.04 h behind; each event is marked on the chart and named beneath it. Readouts include the rate, 0.0 s/day while regulated, with the note decision 26 asks for. `src/sim/averaged.ts` gains `powerFlows`, checked to balance in every regime and against the ledger. PHYSICS.md gains D13 and five predictions, with no new parameter. Decision 38.

- **M7b: Peak-charging rectifier** (2026-09-27). The capacitor charges from the D9 sine through a full-wave rectifier with its drop and the coil's resistance, conducting only near the peaks, so it charges toward the peak less the drop. The mean current, its mean square, and the power drawn have closed forms over a cycle (`src/sim/rectifier.ts`), which both modes use through `coilCurrents`. A test integrates all three over a turn of the drawn waveform, and another integrates the circuit with its ripple, 10 mV, which moves the mean by 0.3 mV. Averaged mode solves its regulated and free balances over the rectifier's conduction angle with an Illinois false-position solver (`src/sim/solve.ts`), at 3 µs and 5 µs a step. The capacitor settles at 1.34 V at 8 rev/s (was 0.80 V), and the IC browns out at 4.275 rev/s (was 6.44). `IC_START_V` rose from 0.75 V to 1.0 V, because at 0.75 V the IC restarted 158 times after brownout. The regulator's gains were retuned to (0.03, 0.03, 0.005) by rerunning D6's grid search, because the old ones locked in 5.5 s. D4, D5, D6, D7, D8, D9, D12, **Model predictions**, **Energy budget**, and **Plausibility check** are rewritten from the new balance, and the known gap is closed. D12's open question is answered: the capacitor, not the brake, makes a knock back swing further than one forward. Decision 37, and amendments to 6, 20, 23, and 36.

- **M7: `loop` widget** (2026-09-27). The whole movement at full wind in detailed mode, regulated, opening locked on the steady 11.2% duty. The glide wheel is drawn as the reference sees it, turned by the phase error: locked, it stands still with its north pole under the coil; knocked, it swings away and back. A scope traces the last 8 s of speed, phase error, and brake duty. "Knock +2 rev/s" and "Knock −2 rev/s" apply the nominal shock: the phase error swings +44.6° to +55.6° or −56.4° to −67.3°, depending on where in the reference period the knock lands, and lock returns within 3.0 s. The Regulation toggle opens the coil and the wheel runs away toward 30.6 rev/s, the phase error growing 22.6 turns a second; back on, the reference restarts from the wheel as at a power-on, and the loop relocks (4.75 s after 3 s off) while the hands keep what they gained. Readouts give speed, phase error, duty, brake torque, time in lock, the hands against true time, and the wind. Still frames run six seconds of the response at once. PHYSICS.md gains D12 and five predictions, with no new parameter; `tests/sim/disturbance.test.ts` gains the knock's swing over the reference period. `placeLabels` moved to `widgets/shared/labels.ts`. Decision 36.

- **M6: `quartz` widget** (2026-09-27). A logic analyser on the divider chain: thirteen rows, the crystal's 32,768 Hz at the top and each row below half the one above, down to the 8 Hz reference, scrolling past a "now" edge with a lamp for each stage's level. The primary control slows the crystal by powers of two, from real time, where only the 32, 16, and 8 Hz stages can be drawn and the reference ticks eight times a second, to 1/4,096, where the crystal itself swings at 8 Hz. Rows too fast to draw are shaded, not aliased, and a tuning-fork crystal swings beside the diagram, blurred until it is slow enough to follow. Dashed lines mark each counter rollover, where every stage falls at once: a reference tick. Readouts give the playback rate, the crystal's frequency on screen, how often a tick comes, the counter, and the ticks given. `src/sim/quartz.ts` gains each stage's level as a bit of the cycle count, the counter, and the tick count; PHYSICS.md gains D11, with no new parameter. `widgets/shared/format.ts` gains `formatCount` and `formatShortTime`, and slow playback rates group their thousands ("1/4,096×"). The widget contract test now accepts a slider as a widget's own control. Decision 34.

- **M5: `lenz-brake` widget** (2026-09-27). The reader holds the glide wheel at 8 rev/s and lets it go with the mainspring out of the way. A plot traces its speed until friction and the coil stop it. The primary control is the share of the time the coil is shorted: open, the wheel coasts 1.118 s; a quarter of the time shorted, 0.299 s; shorted throughout, 0.110 s. The open coil's run stays on the plot for reference, with the last three runs faint beside the current one. Arcs around the wheel compare brake and friction torque, which at full brake is 20.85 times friction. Readouts give speed, the share shorted, both torques in nN·m, the mean coil current, and the time since letting go. `src/sim/spindown.ts` steps the coast as detailed mode does, with a ledger that closes exactly. PHYSICS.md gains D10, its predictions, and a note that a sine EMF into a pure resistance would brake π²/8 harder than the model's rectified mean (an open question). The magnet and coil drawing moved to `widgets/shared/`. Decision 33.

- **M4: `generator` widget** (2026-09-26). The reader drags the glide wheel's speed from rest to 16 rev/s, and the wheel's two-pole magnet turns under the coil at exactly that speed while a scope traces the coil's EMF over the last half second, on fixed scales, so the wave grows taller and more tightly packed together as the speed rises: at 8 rev/s it peaks at 1.57 V, cycles at 8 Hz, and averages 1.00 V rectified, with a dashed line marking that mean. Readouts give speed, frequency, peak, and rectified mean with units, and Slow motion (⅛×) shows the letters N and S so each pole can be matched to the trace. `src/sim/generator.ts` gains `instantaneousEmfV`, `peakEmfV`, and `emfFrequencyHz`: a sine whose rectified mean is exactly the k_e·ω the dynamics use, so no existing number moves. PHYSICS.md gains `GENERATOR_POLE_PAIRS` (an assumption, 1) and D9. `runtime/controls.ts` gains `createSlider`, a native range input; motion blur and `formatPlayback` moved into `widgets/shared/`. An e2e test now fails if two controls on the page share an accessible name, which the first run of this widget caught. Decisions 31 and 32.

- **M3: `runaway` and `hero-glide` widgets** (2026-09-26). The first two real widgets, replacing M0's placeholder. `hero-glide` sets a Spring Drive, its seconds hand geared to the regulated glide wheel in detailed mode, beside a mechanical watch stepping 8 times a second, with a 12× loupe under each that follows its hand's tip. The scale glides past one and jumps past the other, and Slow motion (⅛×) is the primary control. `runaway` starts let down. Wind spins the unbraked wheel up to 30.6 rev/s in detailed mode, drawn with motion blur rather than aliasing, while the dial's hands race faint true-time hands. Fast-forward (1 h/s, averaged mode) runs the spring down in 28.94 h, with the hands having shown 71.73 h (PHYSICS.md, D8). The sim gains `detailedFromAveraged` (a detailed run locked from its first tick), `windDetailed` and `windAveraged`, and a `windJ` ledger term that keeps the energy balance closed across a wind. `src/widgets/shared/` holds the widget shell, readout formatting, and dial geometry; `tests/widgets/mount.test.ts` runs the widget contract against every widget. PHYSICS.md gains `MECHANICAL_BEAT_HZ` (an assumption) and D8. Decisions 27 to 30.
- **M2: Averaged mode and CLI** (2026-09-26). `src/sim/averaged.ts`: a quasi-steady mode in steps of up to 1 s. The glide wheel sits where its torques balance and the capacitor where its currents balance, in one of five regimes: regulated (solved in closed form), catching up, holding back, free, and stalled. Phase error returning to zero and a capacitor browning out are located exactly within a step, so one 10 h call equals 36,000 one-second ones. A full 72 h run-down takes well under a second. Physics tests 3 (rate: 0 s/day while regulated, because the crystal is exact; decision 26), 4 (regulation for 70.645 h, brownout at 70.848 h and 6.433 rev/s, stall at 73.725 h, and the energy ledger closes to 10⁻⁹), and 7 (the modes agree to 10⁻⁶ in speed and 0.02 s/day in rate while regulated, and to 2 × 10⁻⁴ unregulated, each gap explained and measured) pass. `npm run sim -- <scenario>` writes a CSV with units in every header for `full-wind-lock`, `runaway`, `rate-24h`, `rundown-72h`, and `shock`. CI and `npm run check` run all five. `tsx` is a new dev dependency. PHYSICS.md gains `AVERAGED_STEP_S`, derivation D7, and the run-down predictions. Decisions 23 and 24.
- **M1: Sim core and PHYSICS.md** (2026-09-26). All of detailed mode in `src/sim`: mainspring (a piecewise-linear torque curve with exact stored energy), train, glide wheel (Coulomb, viscous, and Stribeck friction, so a dying spring stalls the wheel rather than letting it crawl for hours), generator (rectified-mean EMF, duty-averaged brake and charging paths), capacitor and IC (constant power, brownout with restart hysteresis), quartz divider (integer-counted, exact over 72 h), a PID regulator on the crystal's 8 Hz tick, a 4,096 Hz semi-implicit Euler stepper with a term-by-term energy ledger, lock metrics, and seeded shocks. `PHYSICS.md` derives every parameter in `PLAN.md`'s order, with the arithmetic, a table of model predictions the tests assert, and the 72 h energy budget. Physics tests 1, 2, 5, 6, and 8 pass, with every tolerance explained. The full-wind lock time (3.75 s) is asserted exactly. A coverage test ties every `params.ts` export to its `PHYSICS.md` row, label, and value. The IC's 25 nW is labelled an assumption, because its sources could not be opened from the build container. Decisions 19 to 22, and an amendment to 6 (PI became PID).
- **M0: Scaffold** (2026-09-25). Vite 8 and strict TypeScript 6, ESLint 10 with typescript-eslint, Prettier, Vitest 5, and Playwright 1.63, all behind `npm run check`. `src/runtime` has the scheduler (one loop, global pause, offscreen pause through IntersectionObserver, reduced motion with a per-widget Play button, a clamped step, and a loop that idles when nothing ticks), the light and dark palette (inlined into `index.html` at build time, with every part colour at WCAG AA for text), a HiDPI canvas, and button helpers. A placeholder widget proves it all end to end, on a 380 px touch project and a desktop project. Lint and a DOM-free `tsconfig` enforce `src/sim`'s purity and the scheduler's monopoly on `requestAnimationFrame`, each proven by a fixture that must fail. Jost is bundled from `@fontsource/jost`, and an e2e guard fails any test that makes an off-origin request. CI's `scaffold` gate is gone. The index page has the article's section skeleton with PROSE stubs, and a footnote crediting Bartosz Ciechanowski's *Mechanical Watch* as the inspiration, at the maintainer's request. Decisions 12 to 18, and an amendment to 10.

## Ideas, not yet scheduled

Pull these up into a milestone when the maintainer decides they are the most valuable next thing.

- **A faster averaged solve, if the maintainer accepts moving the last digits.** Averaged mode solves each balance to one ulp (decision 37), and that is now the largest single cost on the page: about 10 µs a step, 0.6 ms a frame for tri-synchro at an hour a second (decision 39). Stopping the solver at, say, 10⁻¹² relative would cut that, but it would move the model's figures in their last digits, so it is a physics choice, not a performance one. It is not needed for the budget today.
