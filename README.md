# Spring Drive: an interactive explainer

A long-form article on how Seiko's Spring Drive keeps time. A mainspring drives a glide wheel, and the glide wheel generates electricity. A quartz reference then tells an electromagnetic brake how hard to hold the wheel back. Small interactive widgets sit in the prose, each driven by a physics simulation in real SI units, with plausible 9R-class parameters.

Where the real movement's numbers are not published, the model's are derived to be self-consistent, and they are labelled as modelled. `PHYSICS.md` has every value and where it came from.

## Working on it

```
npm ci
npm run dev      # http://localhost:5173
npm run check    # everything CI runs
```

`package.json` arrives with milestone M0, the scaffold, and `npm run sim -- <scenario>` with M2. See `CLAUDE.md` for the full command list.

| File | What it is |
|---|---|
| `PLAN.md` | The design: architecture, physics, article outline, widget requirements |
| `PHYSICS.md` | Every physical parameter, labelled published, derived, or assumption |
| `docs/ROADMAP.md` | Milestones and acceptance criteria, status, open questions |
| `docs/DECISIONS.md` | Why things are the way they are |
| `docs/ARCHITECTURE.md` | What has been built so far |
| `CLAUDE.md` | The working agreement for the agents building it |

## How the work happens

Most of the code is written by Claude, one milestone per night, as one pull request that Nathan reviews in the morning. The procedure is `.claude/commands/nightly.md`, run as `/nightly`. Nathan writes the prose. Agents leave `<!-- PROSE: ... -->` stubs where it belongs.

## Deployment

The site is static and deploys to Cloudflare Pages from `master`: build command `npm run build`, output directory `dist`. M0 adds the details.

## License

MIT. See `LICENSE`.
