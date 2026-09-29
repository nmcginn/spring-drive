# Architecture

`PLAN.md` describes the target shape. This file describes what has actually been built. Whenever the two differ, `docs/DECISIONS.md` should say why. Every PR that adds, removes, or moves a module updates **Shape** below in the same PR.

## Shape

```
index.html                  The article skeleton: section headings, PROSE stubs, widget slots, the footnote.
src/
  main.ts                   Finds [data-widget] slots and mounts each widget as it nears the viewport; wires global pause; mounts the `?budget` panel.
  style.css                 Page and widget chrome. Colours only from palette custom properties; Jost from @fontsource.
  sim/
    tsconfig.json           Typechecks src/sim with neither the DOM lib nor Node's types.
    units.ts                Unit conversions (rev/s to rad/s, angle wrapping). Definitions, not parameters.
    types.ts                SimParams, SimState, SimControls, the energy ledger, Scenario, Sample, Shock.
    params.ts               Every physical constant and model choice, each with a PHYSICS.md row; DEFAULT_PARAMS.
    mainspring.ts           Torque-curve interpolation, exact stored energy, winding with a slipping bridle.
    train.ts                Barrel torque reflected to the glide wheel; barrel angle per rotor angle.
    rotor.ts                Glide wheel dynamics: Coulomb, viscous, and Stribeck friction; stick at rest; no reversal; the friction minimum.
    generator.ts            Rectified-mean EMF, duty-averaged brake and charging currents, their torque and heat (the brake is the sine's mean-square heat, decision 35; the charging is the rectifier's, decision 37); the instantaneous EMF waveform (D9).
    rectifier.ts            The charging path over one cycle of the sine: the conduction angle, and the mean current, mean square, and power in closed form (D5, decision 37).
    solve.ts                Bracketed root finding (Illinois false position) for averaged mode's balances.
    power.ts                Capacitor, constant-power IC load, brownout and restart with hysteresis.
    quartz.ts               The 32,768 Hz divider chain, the integer-counted reference phase, and each stage's level as a bit of the cycle count (D11).
    regulator.ts            The PID brake-duty law with anti-windup, run once per reference tick.
    detailed.ts             The 4,096 Hz stepper, the energy ledger, shocks, winding, realignment, and runScenario.
    spindown.ts             The glide wheel let go with the spring out of the way: friction and the duty-averaged coil brake, stepped as in detailed mode, with an exact energy ledger (D10).
    averaged.ts             Quasi-steady mode for hours and days: five regimes, their balances solved over the rectifier's conduction angle (D7), exact event times, winding, runAveragedScenario, the handover to and from detailed mode, and where the power reaching the glide wheel goes (powerFlows, D13).
    metrics.ts              Lock: its definition and the time it is gained. Rate error in s/day.
    rng.ts                  Seeded Mulberry32, the sim's only randomness.
    shocks.ts               Seeded random shock schedules.
  runtime/
    scheduler.ts            The one animation loop: shouldTick, frameDtS, createScheduler, and the browser env; times every tick for the frame budget.
    budget.ts               The 4 ms frame budget: a ring of recent frames' tick times, and their mean, 95th percentile, and per-widget means (decision 39).
    budget-overlay.ts       The `?budget` panel: the scheduler's frame costs on the page, for checking the budget on a real machine.
    palette.ts              Part and UI colour tokens for light and dark, paletteCss, WCAG contrast helpers.
    canvas.ts               HiDPI canvas that tracks its container's width, capped at 2x.
    controls.ts             Button, toggle, and slider helpers, and the reduced-motion Play/Pause button.
  widgets/
    registry.ts             Widget IDs mapped to lazy imports.
    shared/                 What every widget uses (decision 27):
      shell.ts                The canvas, readouts, controls, scheduler registration, and unmount.
      format.ts               Readout values with their units, counts with thousands separators, short times, and playback rates.
      labels.ts               Placing labels along a line so none overlaps another, pure.
      dial.ts                 Hand angles and dial geometry, pure.
      draw.ts                 Canvas drawing of dials, hands, labels, the glide wheel's magnet, and the coil.
      magnet.ts               The magnet's pole sectors, and when to letter them, pure.
      motion.ts               Motion blur for anything turning faster than the frame rate.
    hero-glide/             The intro: a gliding Spring Drive beside a ticking watch, with loupes (decision 29). logic.ts is pure; index.ts mounts and draws.
    runaway/                The unbraked glide wheel, wound, in real time or fast-forward (decision 28). logic.ts is pure; index.ts mounts and draws.
    generator/              The magnet turned at the reader's speed, and a scope of the coil's EMF (decision 31). logic.ts is pure; index.ts mounts and draws.
    lenz-brake/             The wheel let go from 8 rev/s, braked by friction and the coil, with its spin-down plotted (decision 33). logic.ts is pure; index.ts mounts and draws.
    quartz/                 The crystal and every stage of the divider chain on a logic analyser, slowed by powers of two (decision 34). logic.ts is pure; index.ts mounts and draws.
    loop/                   The regulated movement at full wind, knocked or unregulated, with the wheel as the reference sees it and a scope of speed, phase error, and duty (decision 36). logic.ts is pure; index.ts mounts and draws.
    tri-synchro/            The whole reserve in averaged mode, sped up: the dial, where the wheel's power goes, the power reserve, and a chart of speed, supply, and duty to the stop (decision 38). logic.ts is pure; index.ts mounts and draws.
tools/
  sim-cli.ts                `npm run sim -- <scenario>… | all [--out <dir>]`: main(argv, io) returns the exit code.
  scenarios.ts              The five named scenarios, each a reproducible run in detailed or averaged mode.
  csv.ts                    Samples to CSV, every column named with its unit.
  out/                      Where the CSVs go. Git ignores it.
vite.config.ts              Build config, and the plugin that inlines the palette into index.html.
tests/
  sim/                      Vitest, under Node: all eight physics tests from PLAN.md, a unit test per module, PHYSICS.md coverage.
  tools/                    Vitest: the CSV format and the CLI's contract.
  runtime/                  Vitest: scheduler (with fake-env.ts), palette, canvas, controls.
  widgets/                  Vitest: each widget's pure logic, formatting, and dial geometry under Node; the widget contract for every widget under happy-dom (mount.test.ts).
  lint/                     Vitest: lint and tsconfig fixtures that must fail (decision 18).
  page.test.ts              Vitest: index.html's data-part names, widget slots, and origins.
  harness/                  Vitest: the e2e suite's own pure helpers, such as reading a Chrome trace.
  e2e/                      Playwright: mobile (380 px, touch) and desktop projects, against the production build; then the frame budget at every widget's scroll stop, in projects of its own (budget.spec.ts, trace.ts; decision 39).
```

Every widget in `PLAN.md`'s outline is built, except the optional `movement-3d` (M10). Beyond the target, `widgets/shared/` holds what the widgets share, so each widget directory is only its own logic and drawing (decision 27). Beyond the target, `tools/` splits the CLI into `sim-cli.ts`, `scenarios.ts`, and `csv.ts`, so the scenarios and the format are tested without spawning a process (decision 24). Beyond the target, `sim/` has `spindown.ts` (the brake widget's coast, decision 33), `metrics.ts` (so tests, the CLI, and widgets share one definition of lock), `rectifier.ts` and `solve.ts` (the peak-charging rectifier and the solver for its balances, decision 37), `rng.ts`, and `shocks.ts` (test 8's seeded randomness). `runtime/controls.ts` has buttons, toggles, and sliders (decision 32); a scrubber arrives with the first widget that needs one.

## The rule: physics, runtime, and widgets stay separate

There are three layers, and the boundaries between them are load-bearing.

**Simulation** (`src/sim`) holds the physics, as pure functions over plain data. It takes state, params, and a timestep, and returns the next state. It has no DOM, no timers, and no unseeded randomness, so it runs identically under Vitest, the CLI, and the browser. Everything the article claims about the physics is tested here, without a browser.

**Runtime** (`src/runtime`) is the only place that touches the browser's clock and viewport. That covers the single animation loop, pause, visibility, reduced motion, the palette, canvas setup, and the shared controls. Widgets get time and visibility from here, and never ask the browser directly.

**Widgets** (`src/widgets/<id>`) read sim state and draw it. They make no physical decisions. Any logic a widget holds other than drawing is a pure function, tested in Vitest: mapping state to geometry, formatting a readout with its units, mapping a slider position to a parameter. The Playwright test then only needs to prove the widget mounts, responds, and renders cleanly.

The dependency direction is `widgets → runtime`, `widgets → sim`, and nothing points back. Lint and a separate DOM-free `tsconfig` for `src/sim` enforce it, and fixtures prove the enforcement (decision 18).

## Data flow

```
             scheduler tick (dt; none while paused, offscreen, or reduced-motion)
                   │
                   ▼
params.ts ──► sim step(state, params, dt) ──► SimState ──► widget draw(state, palette)
(PHYSICS.md)     (pure, Node-safe)             (data)         (rendering only)
```

Controls change params or inject events, such as a shock or a wind, between steps. They never reach into the integrator.

## Tests

| Layer | Tool | What it proves |
|---|---|---|
| `src/sim` | Vitest, under Node | The required physics tests from `PLAN.md`, determinism, and PHYSICS.md coverage |
| `tools` | Vitest, and `npm run sim -- all` in CI | The CLI's exit codes and output, CSV headers with units; every scenario runs |
| Widget logic | Vitest | Geometry, readout formatting, control mapping |
| Runtime | Vitest | The tick decision (pause, visibility, reduced motion) as a pure function |
| Widgets in a page | Playwright | Mount, primary control, no console errors, no off-origin requests, screenshots at 380 px and desktop |
| Frame budget | Playwright, then CI's run summary | At every widget's scroll stop, at both widths: widgets' ticks, and the main thread less canvas rasterising, each under 4 ms a frame (decision 39) |
