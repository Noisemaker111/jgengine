# Where things live

One page: which way imports point, where each kind of thing goes, and which check holds each line.
When a check fails, its message names the home; this page is the long form.

## Imports point down

```
scripts/, games/scripts/                 repo tooling: imports anything, nothing ships from it
apps/dev, apps/web, apps/desktop         the runner, the website, the desktop shell
games/<game>                             a game: packages, registry components, games/shared; never another game
examples/*, games/shared                 host examples; build and test helpers the games share
registry/jgengine                        copy-in UI components: @jgengine/core and each other only
packages/jgengine                        the CLI: any engine package
packages/editor                          core, assets, navbake
packages/node                            core, ws, sql, assets
packages/assets, convex, navbake,
  rapier, simulations, sql, ws           core only
packages/core                            the bottom: no other package
```

Two edges are the design, not an exception to copy:

- Core's `*.draw` files may load `@jgengine/ws`. The player in `core/shell` wires the default
  transport, the way three.js ships `three` and `three/addons` in one package.
- A test is a consumer. A core test may drive a boat from `simulations` or use the browser harness in
  `scripts/`; shipped source may not.

Inside core a feature keeps its three layers together in `packages/core/src/<feature>/`: `name.ts`
is the model (no DOM, no three.js, no backend), `name.view.tsx` the UI, `name.draw.tsx` three.js.
Core compiles each layer on its own, so a model file that imports a view is a type error.

## One home per job

| Kind of thing | Home |
| --- | --- |
| An engine feature | `packages/core/src/<feature>/` |
| A mechanic one game needs | that game; the second game that needs it moves it into core and both import it |
| World content | the game's `src/editor.scene.json` |
| UI | JSX on `@jgengine/core/ui/jsx`, drawn through Rune; never React |
| Markup several UI kits draw the same way | `packages/core/src/ui/kit/kitParts.view.tsx` |
| A HUD component a game copies in | `registry/jgengine/` |
| A check or a generator | one row in `scripts/run-stages.ts` |
| Browser and timing helpers for tests | `scripts/` (`browser-lib.ts`, `sharedChromium.ts`, `timing-budget.ts`) |
| What a change did | `changes/<branch>.md`, written by `lane:close`; the release folds them into the changelog |
| A generated file | its generator (`bun run gen --list`); never edited by hand |

Before writing a helper, `bun run find <words>`. A second way of doing a job is the bug: move both
callers to one home and delete the other.

## What holds it

`bun run check` runs three tools with everything else, in CI and in `verify:fast`:

- `lint` (oxlint, `.oxlintrc.json`): the import order above, the React ban, and unused variables and
  imports.
- `unused` (knip, `knip.json`): files nothing imports, exports nothing uses, dependencies nothing
  loads. It cannot judge two things: the public API of a published package (every file is a public
  subpath), and exports inside a game (the runner's tunable discovery reads every export).
- `copies` (jscpd, `.jscpd.json`): the same 200 tokens in two places. It leaves out tests and
  proofs, `registry/` (a copy-in component stands alone on purpose) and `scripts/reference/` (a
  reference sim restates the published model to grade the engine's version).

A new rule lands with the cleanup that makes it pass, and its message says where the thing lives.
