One way to make and update a game: `jgengine create --template <t>` writes the game and its `jgengine.json`, and `jgengine sync` makes the game match that config and the running engine.

### Migrate

- `jgengine create --2d` is now `--template 2d`, and `--shape shared-world-builder` is `--template builder`. `--3d`, `--world` and `--no-world` are gone: `--template 3d` is the default and always has a world.
- A game made before this has no `jgengine.json`. Add one with `name`, `id`, `template`, `editor` and `engine` (its `@jgengine` packages without the scope), then run `npx jgengine sync`.
- `runCreate` is now async.

### Added

- `jgengine.json` at every game's root: name, id, template, editor, the `@jgengine` packages it runs on, template files it took over (`owns`), and in the engine repo its capability answers. It is the one file to read to know what a game uses.
- `jgengine sync [dir...] [--check]` sets the `@jgengine` dependencies to the config and this engine version, rewrites the template's shared files (wiring, page, tooling scripts, AGENTS.md) unless the game owns them, and in the engine repo seeds capability answers and adds each new game-facing capability as a TODO decline. From the repo root it syncs every game.

### Changed

- `jgengine create` writes `jgengine.json` and runs sync.
- In-repo games: each `capabilities.json` moved into its `jgengine.json` (`capabilities`), adopts and declines sorted. The capability gate and probe read it there. A new `games-sync` gate (`jgengine sync --check`) runs in the games job and verify:fast.

### Removed

- `bun run games:new`, its idea kinds, templates and world layout (`games/scripts/new-game*`, `games/docs/new-game.md`). In-repo games start with `bun run jgengine create "<Title>"`.
- `bun run games:capabilities declare`: sync seeds a game's capability answers.

Engine seam: packages/jgengine/src/sync.ts, packages/jgengine/src/projectConfig.ts

Prevention: `games-sync` gate; `packages/jgengine/src/sync.test.ts`.

Verification: `bun test packages/jgengine/src` pass; `bun run jgengine sync --check` up to date for all 18 games; a `--template 3d` game created outside the repo with npm boots, and after renaming it and turning the editor off in `jgengine.json`, `jgengine sync` rewrote the page, wiring and package.json and it still boots.

## Bends

- Deleted three template tests (`world`, `track`, `places` `.test.ts.tmpl`) together with the `games:new` generator they tested.
- `games/scripts/check-capabilities.test.ts` and `scripts/ci-scope.test.ts` expectations changed to the new file and message names, not loosened.
- `packages/jgengine/src/sync.test.ts` builds its games under the OS temp folder (`fixture-location: allow`): a standalone game has to sit outside every workspace.
- Capability answers are synced only for games in the engine repo's `games/`; an outside game's `jgengine.json` has none (the ledger reads engine source).
