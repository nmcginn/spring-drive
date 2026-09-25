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
  runtime/
    scheduler.ts            The one animation loop: shouldTick, frameDtS, createScheduler, and the browser env.
    palette.ts              Part and UI colour tokens for light and dark, paletteCss, WCAG contrast helpers.
    canvas.ts               HiDPI canvas that tracks its container's width, capped at 2x.
    controls.ts             Button helper and the reduced-motion Play/Pause button.
  widgets/
    registry.ts             Widget IDs mapped to lazy imports.
    placeholder/            M0's stand-in widget, replaced from M3 on. logic.ts is pure; index.ts mounts it.
vite.config.ts              Build config, and the plugin that inlines the palette into index.html.
tests/
  sim/                      Vitest, under Node.
  runtime/                  Vitest: scheduler (with fake-env.ts), palette, canvas, controls.
  widgets/                  Vitest: pure widget logic under Node, and mount/unmount under happy-dom.
  lint/                     Vitest: lint and tsconfig fixtures that must fail (decision 18).
  page.test.ts              Vitest: index.html's data-part names, widget slots, and origins.
  e2e/                      Playwright: mobile (380 px, touch) and desktop projects, against the production build.
```

The target in `PLAN.md` also lists `sim/params.ts` and the physics modules (M1), `sim/averaged.ts` and `tools/sim-cli.ts` (M2), and the real widgets (M3 to M8). `runtime/controls.ts` has only the button helpers so far; sliders, scrubbers, and toggles arrive with the first widget that needs them.

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
| Widget logic | Vitest | Geometry, readout formatting, control mapping |
| Runtime | Vitest | The tick decision (pause, visibility, reduced motion) as a pure function |
| Widgets in a page | Playwright | Mount, primary control, no console errors, no off-origin requests, screenshots at 380 px and desktop |
