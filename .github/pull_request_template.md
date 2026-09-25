## What changed

<!-- The change in a couple of sentences. What can a reader of the article see or do now that they could not before? -->

## Why

<!-- The roadmap milestone this completes, or the issue it fixes. If stacked on another PR, say so on the first line. -->

Roadmap task:

## How it was verified

<!-- Each acceptance criterion from docs/ROADMAP.md, and how it was checked: the test that covers it by name, or what you looked at by hand. -->

- [ ] `npm run check` passes (typecheck, lint, format, unit tests, build, e2e)
- [ ] Every acceptance criterion is covered by a named test or a described check
- [ ] Tests cover the awkward cases (run-down spring, huge frame gap, pause, reduced motion, offscreen and back, remount, 380 px)
- [ ] Physics: every new or changed constant is in `params.ts` and has a `PHYSICS.md` row with its label
- [ ] Physics: no test tolerance was loosened (or the reason is given below)
- [ ] Widgets: animation goes through the scheduler, colours come from `palette.ts`, every readout has units
- [ ] Widgets: works at 380 px with touch, respects global pause and reduced motion
- [ ] No article prose written; `<!-- PROSE: -->` stubs and `span.part` wrappers are in place

## Screenshots

<!-- Any widget work: 380 px and desktop widths. Say where they are (the CI run's `screenshots` artifact, by file name) and what each shows. Delete this section if nothing visible changed. -->

## Physics assumptions

<!-- New or changed PHYSICS.md entries, one line each with its label (published / derived / assumption). Claims about the real 9R you could not source go here too. "None" if none. -->

## Review notes

<!-- What deserves the closest look? Anything you were unsure about, or left unfinished? -->

<!-- Added roadmap follow-ups? One sentence each on why it is a separate PR rather than part of this one. If it finishes something this PR started, it is not a follow-up. -->
