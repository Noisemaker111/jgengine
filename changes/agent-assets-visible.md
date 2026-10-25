### Added

- `bun run dev` for any game pulls the asset packs and library models its source names and its `public/` lacks before the dev server starts (`games/shared/provisionAssets.ts`); `bun run shoot` and `bun run drive` do the same for the game they capture. `JG_DEV_PROVISION=0` skips it offline; CI skips it unless `JG_DEV_PROVISION=1`.
- A model that still fails to load is named: in a dev build its placeholder box carries a "MISSING <name>" label and a bottom-left banner lists every missing model; `modelLoadFallbacks()` returns `MissingModelRecord`s with that name, and `subscribeModelLoadFallbacks` notifies on new ones.
- `VfxKind` gains `"arc"`: a melee swing drawn as a sweep across the attacker's front, high to low.

### Changed

- `shoot` and `drive` fail (exit 1) when any model was drawn as a placeholder, naming each one, instead of passing with identical pink boxes.
- The `slash`, `sword` and `melee` vfx presets are amber arcs in front of the attacker instead of a white spark burst from the body center. A slash with no target sweeps where the attacker faces.
