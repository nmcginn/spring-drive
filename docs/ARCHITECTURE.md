# Architecture

`PLAN.md` describes the target shape. This file describes what has actually been built. Whenever the two differ, `docs/DECISIONS.md` should say why. Every PR that adds, removes, or moves a module updates **Shape** below in the same PR.

## Shape

```
index.html                  The article skeleton: section headings, PROSE stubs, widget slots, the footnote.
src/
  main.ts                   Finds [data-widget] slots and mounts each widget as it nears the viewport; wires global pause.
  style.css                 Page and widget chrome. Colours only from palette custom properties; Jost from @fontsource.
  sim/
    tsconfig.json           Typechecks src/sim with neither the DOM lib nor Node's types.
    units.ts                Unit conversions (rev/s to rad/s, angle wrapping). Definitions, not parameters.
    types.ts                SimParams, SimState, SimControls, the energy ledger, Scenario, Sample, Shock.
    params.ts               Every physical constant and model choice, each with a PHYSICS.md row; DEFAULT_PARAMS.
    mainspring.ts           Torque-curve interpolation, exact stored energy, winding with a slipping bridle.
    train.ts                Barrel torque reflected to the glide wheel; barrel angle per rotor angle.
    rotor.ts                Glide wheel dynamics: Coulomb, viscous, and Stribeck friction; stick at rest; no reversal; the friction minimum.
    generator.ts            Rectified-mean EMF, duty-averaged brake and charging currents, their torque and heat.
    power.ts                Capacitor, constant-power IC load, brownout and restart with hysteresis.
    quartz.ts               The 32,768 Hz divider chain and the integer-counted reference phase.
    regulator.ts            The PID brake-duty law with anti-windup, run once per reference tick.
    detailed.ts             The 4,096 Hz stepper, the energy ledger, shocks, winding, realignment, and runScenario.
    averaged.ts             Quasi-steady mode for hours and days: five regimes, exact event times, winding, runAveragedScenario, and the handover to and from detailed mode.
    metrics.ts              Lock: its definition and the time it is gained. Rate error in s/day.
    rng.ts                  Seeded Mulberry32, the sim's only randomness.
    shocks.ts               Seeded random shock schedules.
  runtime/
    scheduler.ts            The one animation loop: shouldTick, frameDtS, createScheduler, and the browser env.
    palette.ts              Part and UI colour tokens for light and dark, paletteCss, WCAG contrast helpers.
    canvas.ts               HiDPI canvas that tracks its container's width, capped at 2x.
    controls.ts             Button and toggle helpers, and the reduced-motion Play/Pause button.
  widgets/
    registry.ts             Widget IDs mapped to lazy imports.
    shared/                 What every widget uses (decision 27):
      shell.ts                The canvas, readouts, controls, scheduler registration, and unmount.
      format.ts               Readout values with their units.
      dial.ts                 Hand angles and dial geometry, pure.
      draw.ts                 Canvas drawing of dials, hands, and labels.
    hero-glide/             The intro: a gliding Spring Drive beside a ticking watch, with loupes (decision 29). logic.ts is pure; index.ts mounts and draws.
    runaway/                The unbraked glide wheel, wound, in real time or fast-forward (decision 28). logic.ts is pure; index.ts mounts and draws.
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
  e2e/                      Playwright: mobile (380 px, touch) and desktop projects, against the production build.
```

The target in `PLAN.md` also lists the widgets still to come (M4 to M8). Beyond the target, `widgets/shared/` holds what the widgets share, so each widget directory is only its own logic and drawing (decision 27). Beyond the target, `tools/` splits the CLI into `sim-cli.ts`, `scenarios.ts`, and `csv.ts`, so the scenarios and the format are tested without spawning a process (decision 24). Beyond the target, `sim/` has `metrics.ts` (so tests, the CLI, and widgets share one definition of lock), `rng.ts`, and `shocks.ts` (test 8's seeded randomness). `runtime/controls.ts` has buttons and toggles so far; sliders and scrubbers arrive with the first widget that needs them.

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
