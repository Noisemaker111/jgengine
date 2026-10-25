# Ember Command

Repo rules are in [../AGENTS.md](../AGENTS.md); the design checklist is in [README.md](README.md). Rules specific to this game:

- `src/` root holds only the entry and editor files (`game.config.ts`, `index.tsx`, `main.tsx`, `loop.ts`, `world.ts`, `editorLayers*`, `editorCatalogs*`, `editor.scene.json`, `index.css`, `style.css`) plus `art/`; game code goes under `src/game/`.
- The player spawns at the authored `player_spawn` marker (`authoredSpawnPosition`), with `id === ctx.player.userId` in `onNewPlayer`.
- World content is proved with `summarizeEnvironment` in `src/game/world.world.test.ts`, not screenshot loops.
- `@source` in `src/index.css` must cover `@jgengine/react` and `@jgengine/shell`, or the HUD renders unstyled.
- Repeating a gather order to the same node and resource keeps that worker's travel, harvest timer and carried load; a new target or resource is a new order. Depletion and yields stay owned by the core `ResourceNodeField` API.
