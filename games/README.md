# JGengine Games

Playable games built with [`jgengine`](https://github.com/Noisemaker111/jgengine) — each game is a standalone Vite app on `@jgengine/*`, running the engine source in this repo's `packages/`.

These games use familiar genres with their own titles, settings, characters, and authored content. They also probe engine capabilities. To build a new game, use `npx jgengine create`; assets and upstream source retain their individual licenses.

## Build games through shared capabilities

Every game interaction composes JGengine behavior. When a reusable capability is
missing or broken, improve its upstream package with a real game adopter instead
of implementing the same fix separately in each game. Adopt existing SDK behavior
and remove redundant local machinery. Games retain their unique rules, stories,
items, assets, editor-authored worlds and presentation.

An engine change reaches every game in the same commit, and a change that breaks one fixes it in the same PR.
Shared behavior must support different designs and art directions,
not impose identical assets or layouts. [AGENTS.md](AGENTS.md#framework-first-development)
owns the discovery, upstream implementation, adoption and verification workflow.

## Games

| Game | Id | Description |
| --- | --- | --- |
| Ember Command | `ember-command` | Highland command skirmish |
| Brightway Park | `brightway-park` | Park-builder tycoon |
| Odd Orbit | `odd-orbit` | Alien household sim |
| Scrap Signal | `scrap-signal` | Looter-shooter |
| Beacon Bastion | `beacon-bastion` | Tower defense |
| Deepward | `deepward` | First-person extraction slice: salvage, pack, return and bank |
| Harbor Heat | `harbor-heat` | Coastal courier and crew adventure |
| Drift Foundry | `drift-foundry` | Physics racer |
| LLMville | `llmville` | Shared-world AI-lab tycoon on a Convex backend (accounts, multiplayer); production still deploys from its old repo |

See [the genre roadmap](./CLASSICS.md) for planned mechanics and [content provenance](./CONTENT-PROVENANCE.md) for source and asset attribution.

## Improve the games

[The individual improvement plans](https://github.com/Noisemaker111/JGengine-games/issues/52) cover all eight games: identity, interacting decisions, progression and recovery, authored space, terrain and art, feedback, and complete-session testing. Use the engine's [game-improvement skill](https://github.com/Noisemaker111/jgengine/blob/beta/.claude/skills/game-improvement/SKILL.md) with the existing domain skills. Keep verified rules, playing experience and presentation separate; a passing test suite does not establish a finished game.

## Develop

From the repository root:

```sh
bun install --frozen-lockfile
bun run games:provision            # link every asset pack the games reference from the shared store
bun --cwd=games/harbor-heat run dev # or another game id
```

`bun run games:provision <game-id>` does one game. Packs live once per machine in the main checkout's `.asset-store/` (`JG_ASSET_STORE` overrides); each game's `public/<kind>/<id>` is a link into it, the store is seeded from any copy a checkout already pulled, and only a pack no checkout has is downloaded. CI never downloads packs or boots games; `verify:fast` boots them locally. A test that reads model files from `public/` uses `assetTest` and `missingServed` from `games/shared/assetTest.ts`: it skips in CI and, on a machine without the packs, names each missing file and the fix. A pack counts as referenced when its source
id appears in the game's `src/`. `bun --filter="@games/*" run check-types` and `bun test games` check every game.

## Design checklist and loop proofs

Every game's README states the same six-section design checklist (core loop, progression, failure
states, minute 5 → hour 5, references, gap to target) and ends it with one `Loop proof:` line naming
the flow that proves the stated loop. `bun run check games-design` (also run by CI) fails a game that
is missing a section, names a flow whose `<game>/proofs/flows/<name>.json` is absent or does not
parse, or ships a flow with no arrival assert. A name marked `TODO` is a promised flow nobody has
written: it is reported, and `--strict` fails it.

A flow runs headless from the repository root:

```sh
bun run drive harbor-heat --state chase --flow to-chase     # add --state when the flow needs a staged entry
```

`bun run shoot --prove harbor-heat --view boulevard --view downtown --sizes 1600x900,1024x640 --flow to-chase --state chase`
is the whole evidence set for one item in one command: captures each view at each size in play mode, a same-code
control pair for this machine's noise floor, a pixel diff between the two states (mean-abs and >8 share), the driven
flow with its step log, and one `.scratch/proofs/<game>/runs/<stamp>/manifest.json` listing every artefact and its
numbers. A capture the engine's guards refuse - no 3D canvas, a flat frame, a missing tier -
fails the bundle with the reason instead of leaving a blank frame. Artefacts are cached on the game's tree hash, the engine commit, the tools, the view, the size and the tier, so
an unchanged input says `[cached]` and a changed one re-runs. It bundles only this checkout's `games/<game>`. A lane cites those numbers in its PR body instead of
a paragraph of claims.

Deepward uses original procedural industrial geometry and needs no downloaded
asset packs. Start it with `bun --cwd=games/deepward run dev`; see [its controls and current limits](deepward/README.md).

Each playable game is a standalone Vite harness: `index.html` loads
`src/main.tsx`, and `vite.config.ts` resolves the engine packages from source. Run `bun run dev` inside the game's directory.

See [historical published-package verification](GAME-PR-VERIFICATION.md) for earlier
Brightway Park and Scrap Signal asset provisioning, checks and playtest limits.

## Engine source

The games are workspaces of this repo. Each one depends on `@jgengine/*` as `workspace:*`, and
`vite.config.ts` resolves those imports to `packages/<pkg>/src` through
[`shared/viteEngineSource.ts`](shared/viteEngineSource.ts), so a dev server, a test and a
type-check all read the engine source in the same commit. An engine change that breaks a game
fixes that game in the same PR. npm releases are for users outside this repo; no game waits on one.

Third-party versions shared with the engine (three, React, React Three Fiber, Vite, Convex) come
from the root `catalog`. The engine packages take three and React as peer dependencies, and
`engineSource` dedupes the ones a game declares, so each game loads one copy of each.

CI's `games` job runs the games' gates on every game and the type-check, tests and boot probes of
each game the change reaches: a changed file inside it, or a changed engine package it declares.

## Credits

See the repo's [CREDITS.md](../CREDITS.md) and per-game `src/game.config.ts` (`credit` export).
