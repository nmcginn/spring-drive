# Spring Drive: an interactive explainer

A long-form article on how Seiko's Spring Drive keeps time. A mainspring drives a glide wheel, and the glide wheel generates electricity. A quartz reference then tells an electromagnetic brake how hard to hold the wheel back. Small interactive widgets sit in the prose, each driven by a physics simulation in real SI units, with plausible 9R-class parameters.

Where the real movement's numbers are not published, the model's are derived to be self-consistent, and they are labelled as modelled. `PHYSICS.md` has every value and where it came from.

## Working on it

```
npm ci
npm run dev      # http://localhost:5173
npm run check    # everything CI runs
```

Node 22 (`.nvmrc`). `npm run sim -- <scenario>` arrives with M2. See `CLAUDE.md` for the full command list.

| File | What it is |
|---|---|
| `PLAN.md` | The design: architecture, physics, article outline, widget requirements |
| `PHYSICS.md` | Every physical parameter, labelled published, derived, or assumption |
| `docs/ROADMAP.md` | Milestones and acceptance criteria, status, open questions |
| `docs/DECISIONS.md` | Why things are the way they are |
| `docs/ARCHITECTURE.md` | What has been built so far |
| `CLAUDE.md` | The working agreement for the agents building it |

## How the work happens

Most of the code is written by Claude, one milestone per night, as one pull request that the maintainer reviews in the morning. The procedure is `.claude/commands/nightly.md`, run as `/nightly`. The maintainer writes the prose. Agents leave `<!-- PROSE: ... -->` stubs where it belongs.

## Deployment

The site is static and deploys to Cloudflare Pages from `master`. To connect the repository:

1. In the Cloudflare dashboard, go to **Workers & Pages → Create → Pages → Connect to Git**, and pick this repository.
2. Set the production branch to `master`.
3. Build settings:
   - Framework preset: **None** (it is plain Vite; a preset adds nothing)
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: leave empty
4. Node version: Cloudflare's build image reads `.nvmrc`, which pins Node 22. If a build ever picks up another version, set the environment variable `NODE_VERSION` to `22` for both Production and Preview.

Every pull request then gets a preview deployment, which is the quickest way to try a widget on a real phone. The build needs no secrets and no environment variables, and the site makes no runtime network requests: fonts and scripts are all served from `dist`.

## License

MIT. See `LICENSE`.
