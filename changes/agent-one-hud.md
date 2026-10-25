### Migrate

- `GameFrame` is gone: pass its `material`/`cut`/`depth`/`tint`/`edge`/`glow` props to `KitPanel` (a panel) or `KitButton` (a button) from `@jgengine/react/uiKitRoot`. `@jgengine/react/gameFrame` is now `@jgengine/react/kitFrame`: `GameMaterial` → `KitMaterial`, `GameCut` → `KitCut`, `GameMaterialLook` → `KitMaterialLook`, `GAME_MATERIALS` → `KIT_MATERIALS`, `gameCutPath` → `kitCutPath`, `gameFrameVars` → `kitFrameVars`; `GameFramesPreview` is `KitFramesPreview`.
- `HudFade` and `useHudAwake` moved from `@jgengine/react/hudFade` to `@jgengine/react/hudLayout`.
- `StatBar`, `VitalBar`, `EntitySummary`, `StatMeter`, the `@jgengine/react/bars` bars (`HealthBar`, `ShieldBar`, `ManaBar`, `BossBar`, `AmmoCounter`, `barTokens`, …) and `@jgengine/react/hudPanel` (the old name of `HudSurface`; `HudPanel` now means only the `HudCanvas` slot) are removed. Draw every meter with `KitMeter`; a HUD's vitals card is `KitVitals`.
- `HudTheme.bar`, `HudSkin.bar` and the `--jg-bar-*` variables are removed; meters take the UI kit's tokens.

### Added

- `HudSlots` and `HUD_CORNER_WIDTH` (`@jgengine/react/hudLayout`): a play HUD's eight edge slots on a `HudCanvas`, with the layout saved per game.
- `@jgengine/react/kitHud`: `KitVitals` (meters plus the labeled objective), `KitWaveClock`, `KitHint`, `KitActionBar` (keyed build/action buttons with costs, progress and the interact prompt), `KitCount` and `KitCounts`.

### Changed

- Every game's HUD runs on the one kit: the nine starter games drop their own `HudFrame` copies for `HudSlots` and the `kitHud` blocks, and the seven frame games draw their frames through `KitPanel`/`KitButton`.
