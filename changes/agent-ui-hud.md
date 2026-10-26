### Migrate

- The HUD lives in one folder per layer. Update deep imports:
  - `@jgengine/react/<file>` → `@jgengine/react/hud/<file>` for `actionHud`, `comboMeter`, `hudButton`, `hudChromePreview`, `hudFrame`, `hudInteract`, `hudLanes`, `hudLanesPreview`, `hudLayout`, `hudLayoutPersist`, `hudSkin`, `hudSkinPreview`, `hudSurface`, `hudTheme`, `hudThemePreview`, `hudThemeRoot`, `hudTokens`, `hudViewport`, `kitHud`, `selectionHud`, `statusEffectBar`, `waveHud`.
  - `@jgengine/react/hud` → `@jgengine/react/hud/hudReadouts` (`Hotbar`, `Coins`, `Clock`, `Speedometer`, `Crosshair`).
  - `@jgengine/core/ui/{hudDocument,hudLayout,hudScale}` → `@jgengine/core/hud/…`; `@jgengine/core/ui/gameLayout` → `@jgengine/core/hud/hudPriority`.
  - `@jgengine/shell/ShellHudPresentation` → `@jgengine/shell/hud/ShellHudPresentation`; `@jgengine/shell/drivers/HudOnlyDriver` → `@jgengine/shell/hud/HudOnlyDriver`; `@jgengine/shell/world/WorldHud` → `@jgengine/shell/world/WorldHud`.
  - `ViewportHuds` moved from `@jgengine/shell/camera/Viewports` to `@jgengine/shell/hud/ViewportHuds`.
  - `@jgengine/shell/vision/FrustumSensorHud` → `@jgengine/shell/vision/FrustumSensorHud`; `@jgengine/shell/vision/HiddenStateProbeHud` → `@jgengine/shell/vision/HiddenStateProbeHud`.
- `WaveBanner` is removed; use `KitWaveClock` (`@jgengine/react/hud/kitHud`) with `text` and `detail`.
- `CurrencyPill` is removed; use `Coins` (`@jgengine/react/hud/hudReadouts`), `icon={null}` for the bare number.
