A fresh `jgengine create` game opens to a world you can see and walk in, for every template, and its model pull works under every package manager.

### Migrate

- A standalone game made before this release: run `jgengine sync` to get the new `optimizeDeps` line in `vite.config.ts`, or `bun dev` stops on `Cannot read file: …draco_decoder.js?url`.

### Fixed

- `bun dev` on a game using the npm packages no longer dies on first load. Vite's dependency pre-bundler could not read the engine's `.js?url` decoder imports; the decoder module is now imported by package name and the template's `vite.config.ts` keeps it out of pre-bundling.
- `jgengine create` pulls the starter models itself again when dependencies were installed with bun or pnpm: it runs the `@jgengine/assets` CLI directly instead of looking for npm's `assets.cmd` shim.
- The model-pull command printed by `create`, the game's AGENTS.md and missing-model messages is `npx @jgengine/assets pull <pack>`, which works after any package manager's install (`npx assets` asked the registry for an unrelated package when bun or pnpm had installed).
- The builder template runs its world offline when no `VITE_CONVEX_URL` is set, instead of a blank "connect this world" page.

### Changed

- `create` scaffolds the starter scene by default (trees, crates and a goal to walk to); `--scene empty` gives just the ground and the player.
