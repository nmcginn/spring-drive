# Decisions

Short records of choices that would otherwise get re-litigated. Add them as they are made. When one is reversed, amend it rather than deleting it, so the history of why stays readable.

A physical parameter is not a decision. It goes in `PHYSICS.md`. A decision belongs here when it is about how the model or the site is built: an integrator, a control law's update rate, a dependency, a test strategy.

Decisions 1 to 9 record choices `PLAN.md` and `CLAUDE.md` made before any code existed. Decisions 10 and 11 came with the nightly-loop setup. Decisions 12 to 18 came with M0.

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
