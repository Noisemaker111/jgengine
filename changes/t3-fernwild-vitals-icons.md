KitVitalIcons draws survival pools as a column of glyphs that fill from the bottom, turning the low tone when a pool needs the player, with the numbers beside each glyph on demand

Refs #2687

Engine seam: packages/core/src/hud/kitHud.view.tsx

### Added

- KitVitalIcons draws survival pools as a column of glyphs that fill from the bottom, turning the low tone when a pool needs the player, with the numbers beside each glyph on demand
- `KitVitalIcons` (`@jgengine/core/hud/kitHud.view`): Survival pools as a strip of glyphs that fill from the bottom as the pool fills: a heart, a bolt, a drumstick, a drop. Also `KitVitalIcon`, `KitVitalIconsProps`.

### Changed

- Fernwild's vitals are ARK's right-edge icon column: temperature, level, weight, water, food, stamina and health as cyan game-icons glyphs; H shows the numbers beside them, as ARK's extended HUD does
