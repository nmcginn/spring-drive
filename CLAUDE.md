# CLAUDE.md

You are building an interactive explainer for Seiko's Spring Drive. Read `PLAN.md` at the start of every session. It is the source of truth for architecture, physics, milestones, and acceptance criteria. `PHYSICS.md` is the source of truth for every physical parameter.

## Session workflow

1. Read `PLAN.md` → find the current milestone in the Status section.
2. Create a branch: `m<N>-<short-name>` (e.g. `m4-generator`).
3. Work on that milestone only. Do not start the next one.
4. Run every check (below). All must pass.
5. Update the Status section and milestone checkboxes in `PLAN.md`.
6. Open a PR. The description must include: what was done, how each acceptance criterion was verified, screenshots for any widget work, any new assumptions added to `PHYSICS.md`, and anything left unfinished.
7. Never push to `main`. Never merge your own PR.

If you are blocked or a requirement is ambiguous, do not guess on anything that changes physics, architecture, or the article structure. Stop, write the question under "Open questions for Nathan" in `PLAN.md`, and open the PR with what you have and `[BLOCKED]` in the title.

## Commands

```
npm run dev         # Vite dev server
npm run build       # Production build to dist/
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
npm test            # Vitest (physics and unit tests)
npm run test:e2e    # Playwright smoke tests
npm run sim -- <scenario>   # Headless sim, writes CSV to tools/out/
```

Required before every PR: `typecheck`, `lint`, `test`, `test:e2e`, `build`.

## Rules

### Simulation (`src/sim`)
- No DOM, no `window`, no timers, no `Math.random` without a seeded RNG. Code must run under Node unchanged.
- SI units everywhere. Name variables with units where ambiguous (`torqueNm`, `omegaRadS`, `capacitanceF`).
- No magic numbers. Every physical constant lives in `params.ts` and has a matching entry in `PHYSICS.md`.
- Adding or changing a parameter means updating `PHYSICS.md` in the same PR with a one-line justification. If the value is an assumption rather than a published figure, label it as such.
- Physics changes must keep all existing physics tests passing. Do not loosen a test tolerance to make it pass without explaining why in the PR.

### Widgets (`src/widgets`)
- Contract: `export function mount(el: HTMLElement, opts?: Options): () => void`.
- Register animation through the scheduler. Never call `requestAnimationFrame` directly.
- Colors come from `palette.ts` tokens only. No hardcoded colors.
- Must work at 380 px width with touch, respect global pause and `prefers-reduced-motion`, and label every readout with units.
- Canvas 2D or SVG. three.js only for the optional M10 widget.

### Prose and content
- Do not write article prose. Leave stubs like `<!-- PROSE: explain why the rotor overspins without a brake -->` where text belongs, and place the widget slot where it should appear.
- Wrap part names in the markup as `<span class="part" data-part="rotor">glide wheel</span>` so prose color-coding matches widget colors.
- Any claim about the real 9R movement must match a published source or be framed as modeled. When in doubt, flag it in the PR.

### Dependencies
- Runtime dependencies: none without flagging in the PR with a reason. Dev dependencies are fine if standard (Vitest, Playwright, ESLint, tsx).
- No frameworks, no CSS frameworks, no analytics, no runtime network requests.

### Style
- TypeScript strict mode, no `any` without a comment explaining why.
- Small modules. Prefer pure functions in `src/sim`.
- Body typeface: Jost (with a system sans fallback stack). Monospace readouts: system monospace.
