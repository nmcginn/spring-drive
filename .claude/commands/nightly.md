---
description: Pick the next roadmap milestone and land it as one reviewable pull request
---

You are doing tonight's increment of work on the Spring Drive explainer. The maintainer reviews it in the morning, so the deliverable is **one pull request they can review over coffee**, and that PR is one complete milestone.

Read `CLAUDE.md` first. It holds the priorities and rules this project is built around. Then read `PLAN.md`, which is the design, and `PHYSICS.md`, which holds the parameters. Then:

## 1. Choose the task

Read `docs/ROADMAP.md`: its Status, its Open questions for the maintainer, and its tasks. Read `CLAUDE.md`'s "What one pull request means" before you size anything. There is no line target, and tests here run several times the length of the code they cover. Judging a milestone by its total diff is what makes a night's work look too big when it is not.

Check open pull requests before choosing anything:

- **A previous night's PR has review comments.** Address them first, pushing to that PR's own branch. Do that before starting anything new: an unaddressed review is the most valuable thing on the table.
- **A previous night's PR is open and unreviewed.** Prefer the next task whose **Needs** are already merged. Milestones are ordered, but they are not a chain. M3 to M7 need only M1, so while M4 is in review, M5 can proceed from `master`. If the next task needs the open PR's work, you may stack on it one deep: branch from that PR's branch, open your PR against it, and say so on the first line of the description (`Stacked on #N — review that first.`). Never stack two deep. If that would be the only option, spend the night on the open PR instead (see "If you finish early") and open nothing new.
- **The maintainer has answered an open question**, in the roadmap or in a PR comment. Record the answer in `docs/DECISIONS.md`, add a *Decided* note to the task it unblocks, and delete the question. That goes in tonight's PR.

Then take the first unchecked task whose Needs are met and that is not waiting on an open question.

If that milestone really is too large, take the smallest **complete** slice: one the reviewer meets as a finished change rather than a staging post. Split the rest into new roadmap tasks. Slice at a seam: another widget, another sim module, an open design question. Never slice a single behaviour into an honest half tonight and a useful half tomorrow. A widget that animates but ignores reduced motion is half a widget.

Watch for taking *too little*, not too much. That is the usual failure.

## 2. Build it

```sh
git fetch origin master
git checkout -b nightly/$(date +%Y-%m-%d)-m<N>-<short-slug> origin/master
```

The session-start hook has already run `npm ci`. Run it again only if you change `package-lock.json` or switch to a branch that did.

Work to the milestone's checklist and acceptance criteria in `docs/ROADMAP.md`. The non-negotiables from `CLAUDE.md`:

- Tests come with the change. They cover the acceptance criteria plus the awkward cases: a run-down spring, a huge frame gap, pause mid-animation, reduced motion, offscreen and back, unmount then remount, 380 px.
- `src/sim` stays pure: no DOM, no timers, no unseeded randomness. SI units, with units in the names.
- Every physical constant lives in `params.ts` with a matching `PHYSICS.md` row, labelled published, derived, or assumption. There are no magic numbers anywhere else.
- Widgets animate through the scheduler, take colours from `palette.ts`, and put units on every readout.
- No article prose: leave `<!-- PROSE: ... -->` stubs, and wrap part names in `span.part`.
- A claim about the real 9R needs a published source, or it is framed as modelled.
- If a requirement is ambiguous in a way that changes physics, architecture, or article structure, do not guess. Follow `CLAUDE.md`'s blocked procedure.

## 3. Validate

```sh
npm run check
```

Typecheck, lint, format, unit tests, build, and e2e must all pass. If a test fails, fix the cause. Never weaken, skip, or delete a test to get to green, and never loosen a physics tolerance without saying why in the PR. If a test is genuinely wrong, change it deliberately and say so.

Then check the thing itself, not just the checks:

- **Physics.** Run the scenarios the change affects (`npm run sim -- <scenario>`, from M2 on) and sanity-check the CSV against the numbers in `PHYSICS.md`. Does the rotor lock at 8 rev/s? Does the reserve land near 72 h? A test that passes against the wrong number is worse than no test.
- **Widgets.** Open every screenshot Playwright wrote under `test-results/screenshots/` and look at it: at 380 px and at desktop width, in both colour schemes if the palette changed. Check that readouts have units, nothing overflows, and part colours match the prose. Say in the PR what each screenshot shows.

In this cloud container, Chromium is preinstalled. Do not run `npx playwright install`. The session-start hook sets `PLAYWRIGHT_CHROMIUM_PATH`. If e2e cannot launch a browser, say so in the PR rather than skipping the step silently.

## 4. Audit your own follow-ups

Before you write the PR, read every roadmap entry you are about to add and ask one question of it: **would the reviewer expect this to be in the PR already?**

- *"The tri-synchro widget should show this divider chain too."* This is a real follow-up. That widget is another milestone, so there is nothing here to finish.
- *"This readout should also show its units."* / *"This constant still needs its PHYSICS.md row."* / *"Reduced motion isn't handled yet."* These are not follow-ups. They are tonight's milestone, still short of the bar in `CLAUDE.md`. Go and finish it.

An entry that fails the question is not an entry. Delete it and do the work now, however large that makes the PR. A finished change beats two thirds of one and a second review of the same paragraph tomorrow. Whether the extra work is small is not the test. Whether it completes a thought this PR started is.

Keep the entries that pass, and in the PR give each one a sentence saying why it is separate. If you cannot write that sentence, it was not a follow-up.

Run the same audit over `PHYSICS.md`. Every constant added to `params.ts` has a row. Every assumption is labelled as one and says why this value. Every derived value shows its arithmetic.

## 5. Ship it

In the same PR:

- Tick the milestone in `docs/ROADMAP.md`, move its summary to **Done**, update **Status**, and add the follow-ups that survived the audit.
- Record notable choices in `docs/DECISIONS.md`, such as an integrator, an update rate, a dependency, or a test strategy.
- Update **Shape** in `docs/ARCHITECTURE.md` for every module added, moved, or removed.
- Update the **Change log** in `PHYSICS.md` for any value that changed after it first landed.

Then commit, push, and open a PR against `master` (or against the PR you stacked on) using `.github/pull_request_template.md`.

The PR description is the handover, and the reviewer has no other context. Say what changed, why, how you verified each acceptance criterion, and what deserves the closest look. List every new assumption in `PHYSICS.md`. Call out anything you were unsure about, especially claims about the real 9R you could not source. A flagged uncertainty is far more useful than a confident-sounding guess.

## If you finish early

Do not start the next milestone. In order:

1. **Finish this one.** Re-run the audit in step 4 over the follow-ups you wrote, and fold in anything that fails it. This is the best use of the time, every time.
2. **Improve what you built.** Add a test for a case you did not cover, tighten a tolerance you can now justify, make a derivation in `PHYSICS.md` easier to check, or add a doc comment explaining something non-obvious.

The goal is consistent, well-reviewed progress, not volume. Neither is a PR that stops at the first defensible boundary.
