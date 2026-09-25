# Architecture

`PLAN.md` describes the target shape. This file describes what has actually been built. Whenever the two differ, `docs/DECISIONS.md` should say why. Every PR that adds, removes, or moves a module updates **Shape** below in the same PR.

## Shape

Nothing has been built yet. M0 adds the scaffold and `src/runtime`, and M1 adds `src/sim`.

<!-- As modules land, list them here, one line each: path, then what it owns.

```
src/
  main.ts              Finds [data-widget] slots and mounts widgets as they near the viewport.
  sim/params.ts        Every physical constant, each with a PHYSICS.md row.
  ...
```
-->

## The rule: physics, runtime, and widgets stay separate

There are three layers, and the boundaries between them are load-bearing.

**Simulation** (`src/sim`) holds the physics, as pure functions over plain data. It takes state, params, and a timestep, and returns the next state. It has no DOM, no timers, and no unseeded randomness, so it runs identically under Vitest, the CLI, and the browser. Everything the article claims about the physics is tested here, without a browser.

**Runtime** (`src/runtime`) is the only place that touches the browser's clock and viewport. That covers the single animation loop, pause, visibility, reduced motion, the palette, canvas setup, and the shared controls. Widgets get time and visibility from here, and never ask the browser directly.

**Widgets** (`src/widgets/<id>`) read sim state and draw it. They make no physical decisions. Any logic a widget holds other than drawing is a pure function, tested in Vitest: mapping state to geometry, formatting a readout with its units, mapping a slider position to a parameter. The Playwright test then only needs to prove the widget mounts, responds, and renders cleanly.

The dependency direction is `widgets → runtime`, `widgets → sim`, and nothing points back. From M0 on, lint and a separate DOM-free `tsconfig` for `src/sim` enforce it (see the M0 task in `docs/ROADMAP.md`).

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
