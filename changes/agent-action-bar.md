One action bar and one HUD overlap model: the ability bar and the kit build strip are the same `ActionBar` with a `look` knob, and HUD blocks check for overlap through the same collision model as every other screen region.

### Migrate

- `KitActionBar` (`@jgengine/react/hud/kitHud`) is gone. Use `ActionBar` from `@jgengine/react/hud/actionHud` with `look="kit"`: `actions` → `defs` (`ActionDef`s), `glyph` → `hotkey`, `variant: "primary"`/`pressed` → `active`, `variant: "ghost"` → `disabled`, `title` → `description`, each `onActivate` → one `onActivate(id)`, `kind` dropped (buttons carry `data-action-id`). `progress`, `trailing`, `prompt` and `wrapAt` keep their meaning. Pass `hotkeys={false}` when the game's own bindings fire the actions. `KitActionProgress` → `ActionProgress`.
- `hudBlockOverlaps`, `formatHudOverlapReport`, `HudBlockOverlap`, `HudBlockBounds` and `HudBlockOverlapOptions` (`@jgengine/react/hud/hudLanes`) are gone. Use `detectLayoutCollisions(blocks.map((b) => hudBlockRegion(b.id, b.rect)), { minArea: 1 })` and `formatLayoutCollisions(collisions, viewport)` from `@jgengine/core/hud/hudPriority`.

### Added

- `ActionDef.detail` (`@jgengine/core/ui/actionModel`): the quieter text after the label, a cost line or unlock condition.
- `ActionBar` takes `look` (`slots` | `kit`), `progress`, `trailing`, `prompt` and `wrapAt`.
- `hudBlockRegion(id, rect)` (`@jgengine/core/hud/hudPriority`); `formatLayoutCollisions` takes the viewport and its header reads `JGENGINE LAYOUT COLLISION`.

### Changed

- fernwild, hold-the-line, briarcrown, orbit-watch, red-frontier and saltwick draw their build or seed strip with `ActionBar look="kit"`. In saltwick the seeds you have not picked read as normal buttons instead of greyed out (greyed now only means unavailable).

Verification:
- `bun test packages/react/src/hud packages/core/src/hud packages/core/src/ui games/deepward/src/game/ui/hudLanes.test.ts`: pass
- `bun scripts/check-types-all.ts` and the six games' `check-types`: pass
- fernwild in the browser: the build strip shows each structure with its cost and key, greyed when unaffordable, and clicking one starts building

## Bends

- `kitHud.test.tsx` lost its `KitActionBar` test with the component; the same behaviour (detail text, unaffordable as ghost, meters, prompt above) is asserted on `ActionBar look="kit"` in `actionHud.test.ts`.
- The `hudBlockOverlaps` tests in `hudLanes.test.ts` now run the same cases through `detectLayoutCollisions`; no case was dropped.
