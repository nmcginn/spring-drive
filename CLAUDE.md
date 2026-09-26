# CLAUDE.md

You are building an interactive explainer for Seiko's Spring Drive: a long-form article with small widgets embedded in hand-written prose, each driven by a physics simulation in real SI units. A reader should come away understanding the mechanism, and every number on screen should survive a watchmaker reading over their shoulder.

Most work here is done by Claude, one pull request per night, reviewed by the maintainer in the morning. That cadence shapes everything below: each change must stand on its own and be verifiable from the PR (its tests, its CI run, its screenshots) without the reviewer checking out the branch.

Read `PLAN.md` at the start of every session. It is the source of truth for architecture, physics, the article outline, and widget requirements. `PHYSICS.md` is the source of truth for every physical parameter. `docs/ROADMAP.md` is the backlog, the project status, and the open questions. `docs/DECISIONS.md` says why things are the way they are, and `docs/ARCHITECTURE.md` says what has actually been built.

## Priorities

In this order, when they conflict:

1. **Physical honesty.** Every number a reader sees traces to `PHYSICS.md`, labelled published, derived, or assumption. A widget that looks right for the wrong reason is a bug. Where the model and the real 9R differ, the article says it is a model.
2. **Smoothness.** Widgets animate at display rate without jank. All visible widgets together stay under 4 ms of main-thread time per frame. The prose is readable before any widget mounts, widgets mount lazily, and an offscreen widget costs nothing.
3. **Reader experience.** Every widget works at 380 px with touch, respects global pause and `prefers-reduced-motion`, labels every readout with units, and uses the same part colours as the prose. What a control does is obvious without instructions.
4. **Testing and validation.** Physics is tested under Node without a browser. Widgets are smoke-tested in Playwright with screenshots. Anything that can be a pure function should be one, precisely so it can be tested.

## Session workflow

Each night a fresh session picks up the next task. The procedure is in `.claude/commands/nightly.md`: run `/nightly`. In short:

1. Read `docs/ROADMAP.md`, including its Status and Open questions, and take the first unchecked task whose **Needs** have merged. Each task is one milestone from `PLAN.md`. Work on that milestone only, and do not start the next one.
2. Branch from `master` as `nightly/<yyyy-mm-dd>-m<N>-<short-name>` (e.g. `nightly/2026-09-26-m4-generator`).
3. Build it, with tests. Run `npm run check`. It must pass.
4. Tick the task in `docs/ROADMAP.md` and update its Status section. Record notable choices in `docs/DECISIONS.md`, new modules in `docs/ARCHITECTURE.md`, and new parameters in `PHYSICS.md`.
5. Open a PR against `master` using `.github/pull_request_template.md`. The description must include: what was done, how each acceptance criterion was verified, screenshots for any widget work, any new assumptions added to `PHYSICS.md`, and anything left unfinished.
6. Never push to `master`. Never merge your own PR.

If you are blocked or a requirement is ambiguous, do not guess on anything that changes physics, architecture, or the article structure. Stop, and write the question under "Open questions for the maintainer" in `docs/ROADMAP.md`, naming the task it blocks. Then open the PR with what you have, with `[BLOCKED]` in the title. When the maintainer answers, the answer becomes a decision in `docs/DECISIONS.md` and a *Decided* note on the task.

### What "one pull request" means

One complete milestone, not one line count. There is no line target, and size is not the test. The reviewer should be able to read it over coffee and see a whole thought. So the first question is "is this finished?", and only after that "is this small?".

A PR carries whatever it takes to be complete: the change, its tests, its PHYSICS.md rows, its screenshots, and its docs. Tests here run several times the length of the code they cover. A change is never worth splitting because its tests are long, and it is equally not worth splitting because the production diff itself ran long.

Splitting is a claim, and a follow-up has to earn it. One of these must be true:

- it lands on a surface this PR does not touch, such as another widget, another article section, or a sim module nothing uses yet;
- it turns on a decision that is the maintainer's to make, so building it now would be guessing at the answer;
- it is a night's work on its own.

Finishing what you just built is none of those. Some follow-ups exist only because the change stops short of the priorities above: a readout without units, a widget that pauses offscreen but ignores reduced motion, a parameter in `params.ts` with no row in `PHYSICS.md`, a test tolerance nobody justified. Those are not follow-ups. They are the rest of the task, and they ship now, however large that makes the diff. Two thirds of a change tonight and the last third tomorrow costs the reviewer two readings of the same paragraph.

The tell is in your own writing. When the review notes say "the cost is that…", what follows is usually the half you should have finished.

## Testing standards

- Every bug fix starts with a failing test.
- Test behaviour, not implementation. Test names are sentences describing the guarantee: `it('locks to 8 rev/s within 3 s of sim time from full wind')`, not `it('works')`.
- Physics tests assert against values stated in `PHYSICS.md`, and every tolerance has a comment saying why it is that wide. Do not loosen a tolerance to make a test pass without explaining why in the PR.
- Widget logic other than drawing is a pure function with Vitest tests: state to geometry, readout formatting with units, control position to parameter.
- Every widget has a Playwright test. It mounts the widget, interacts with its primary control, asserts no console errors, and takes a screenshot at 380 px and desktop widths. Look at every screenshot yourself before opening the PR.
- Always include the awkward cases: a fully run-down spring, zero and very large frame gaps (a tab returning from the background), global pause mid-animation, reduced motion, scrolling offscreen and back, unmount then remount.
- Determinism: seeded RNG only, and no test depends on wall-clock time.
- `npm run check` must pass before anything is pushed. CI runs the same checks.

## Commands

```
npm run dev         # Vite dev server
npm run build       # Production build to dist/
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
npm run format      # Prettier, in place (format:check verifies)
npm test            # Vitest (physics and unit tests)
npm run test:e2e    # Playwright smoke tests
npm run sim -- <scenario>   # Headless sim, writes CSV to tools/out/
npm run check       # Everything CI runs, fastest first. Run before pushing.
```

Required before every PR: `npm run check`. It covers `typecheck`, `lint`, `format:check`, `test`, every sim scenario (`sim -- all`), `build`, and `test:e2e`.

In a cloud session, Chromium is preinstalled. Do not run `npx playwright install`. The session-start hook exports `PLAYWRIGHT_CHROMIUM_PATH`, and the Playwright config uses it (decision 11).

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
- No frameworks, no CSS frameworks, no analytics, no runtime network requests (fonts included: Jost is self-hosted).
- Note anything notable in `docs/DECISIONS.md`.

### Style
- TypeScript strict mode, no `any` without a comment explaining why.
- Small modules. Prefer pure functions in `src/sim`.
- Comments explain *why*. The code already says what.
- Body typeface: Jost (with a system sans fallback stack). Monospace readouts: system monospace.
