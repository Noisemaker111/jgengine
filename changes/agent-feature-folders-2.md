### Migrate

- More features are now one folder in `@jgengine/core` (model `name.ts`, view `name.view.tsx`, draw `name.draw.tsx`). The `@jgengine/react` and `@jgengine/shell` root barrels still export the same names. Update deep imports:
  - Menu: `@jgengine/react/menu/<file>` → `@jgengine/core/menu/<file>.view` for `gameFlowMenus`, `gameMenu`, `gameMenuSaves`, `gameMenuSound`, `menuNav`, `menuRouter`, `menuScreen`, `pauseMenu`, `quickMenu`, `radialMenu`.
  - Settings: `@jgengine/react/settings/<file>` → `@jgengine/core/settings/<file>.view` for `accessibilitySettings`, `keybindingMenu`, `settings`, `settingsBlocks`; `@jgengine/shell/settings/<file>` → `@jgengine/core/settings/<file>.draw` for `QuickControls`, `SettingsChrome`, `SettingsMenu`, `SettingsRuntime`, `appliedSettings`, `settingsController`.
  - Dialog: `@jgengine/react/dialog/{dialogBehavior,modals}` → `@jgengine/core/dialog/{dialogBehavior,modals}.view`.
  - Inventory: `@jgengine/react/inventory/{inventoryGrid,shopGrid,slots}` → `@jgengine/core/inventory/{inventoryGrid,shopGrid,slots}.view`.
  - Notifications: `@jgengine/react/notifications/{notices,notificationCenter,toastStack}` → `@jgengine/core/notifications/<file>.view`; `@jgengine/shell/notifications/ShellNotices` → `@jgengine/core/notifications/ShellNotices.view`.
  - Haptics: `@jgengine/shell/haptics/padHaptics` → `@jgengine/core/haptics/padHaptics`; `@jgengine/shell/haptics/hapticsRoute` → `@jgengine/core/haptics/hapticsRoute.view`.
  - Camera shake: `@jgengine/react/camera/shake/cameraShake` → `@jgengine/core/camera/shake/cameraShake.view`; `@jgengine/shell/camera/shake/<file>` → `@jgengine/core/camera/shake/<file>.draw` for `CameraShakeApplier`, `HitReactionShake`, `shakeChannel`.
  - Combat: `@jgengine/shell/combat/ProjectileModels` → `@jgengine/core/combat/ProjectileModels.draw`.
  - Quest tracker: `@jgengine/react/questTracker` → `@jgengine/core/mission/questTracker.view`.
