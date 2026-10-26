### Migrate

- Saves live in one folder per layer. Update deep imports:
  - `@jgengine/core/game/saveStore`, `game/saveSlots`, `game/saveSlotIndex` → `@jgengine/core/save/<same name>`
  - `@jgengine/core/game/gameSave` → `@jgengine/core/save/saveDocument`; `@jgengine/core/runtime/runtimeSave` → `@jgengine/core/save/snapshotSave`
  - `@jgengine/core/runtime/save` → `@jgengine/core/save/saveConfig`; `@jgengine/core/runtime/hostedWorldStore` → `@jgengine/core/save/hostedWorldStore`
  - `@jgengine/react/save` → `@jgengine/react/save/saveStore`; `@jgengine/react/saveSlots` → `@jgengine/react/save/saveSlots`; `@jgengine/react/saveThumbnail` → `@jgengine/react/save/saveThumbnail`
- `asyncMemoryWorldStore` is removed; wrap `memoryWorldStore()` when an async `HostedWorldStore` is needed (`memoryWorldPersistence` does).
- `SaveSlotMenu` is removed; use `SaveSlotsPane` (`@jgengine/react/gameMenuSaves`), with `heading` for the old `title`.
- `devSavePlugin` has one home, `@jgengine/node/devSavePlugin`.
- `pickWeighted` has one definition, `@jgengine/core/random/pick` (`pickWeighted(rng, items, weightOf)`). The `world/scatterItems` copy (`pickWeighted(entries, roll)`) is removed.
- `createSeededRandom` (`@jgengine/shell/terrain`) is removed; use `seededRng` from `@jgengine/core/random/rng`, which gives the same stream for a string seed.
- Leveling curves live in `progression/`: `@jgengine/core/game/progression` → `@jgengine/core/progression/leveling`. The particle keyframe type is `ParticleCurve` (was a second `Curve`).
