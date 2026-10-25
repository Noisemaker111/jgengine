### Added

- `defineGameSpec({ show })` (`@jgengine/core/worldModel/gameSpec`): built instances of the named kinds or tags appear as entities at their cell or slot (on the ground) and leave when removed or sold, with no game code; a loaded save rebuilds them.
- `defineGameSpec({ autoStart: true })`: the next available story job starts by itself, so a story runs beat after beat without a giver contact.
- `pursue({ anchor, hunts })` (`@jgengine/core/scene/behaviors`): `anchor` keeps a pursuer beside another entity (a tamed pet heels at about 2.5 m and returns to it after a fight); `hunts` lists the entity names it auto-aggroes on, instead of the player.
- The dev runner serves a game's own `public/` files (`apps/dev/gamePublicPlugin.ts`), so a game's committed models load under `bun run drive` as they do under the game's own Vite.

### Fixed

- `bun run drive <game> --game-dir <path> --flow <name>` reads the flow from the served game's own `proofs/flows/`, not the engine checkout's `Games/<game>`.
