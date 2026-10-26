### Migrate

- Camera shake, haptics and notifications each live in one folder per layer. Update deep imports:
  - `@jgengine/core/vfx/cameraShake` → `@jgengine/core/camera/shake/cameraShake`
  - `@jgengine/core/input/haptics` → `@jgengine/core/haptics/haptics`
  - `@jgengine/core/game/notices` → `@jgengine/core/notifications/notices`
  - `@jgengine/core/game/notifications` → `@jgengine/core/notifications/notificationCenter`
  - `@jgengine/shell/camera/shakeChannel` → `@jgengine/shell/camera/shake/shakeChannel` (`@jgengine/shell/camera` still exports `cameraShake`)
  - `@jgengine/shell/audio/hapticsRoute` → `@jgengine/shell/haptics/hapticsRoute`; `@jgengine/shell/input/padHaptics` → `@jgengine/shell/haptics/padHaptics`
  - `@jgengine/shell/ShellNotices` → `@jgengine/shell/notifications/ShellNotices`
  - `@jgengine/react/cameraShake` → `@jgengine/react/camera/shake/cameraShake`
  - `@jgengine/react/notices` → `@jgengine/react/notifications/notices`; `@jgengine/react/notifications` → `@jgengine/react/notifications/notificationCenter`
  - `ToastStack` moved from `@jgengine/react/components` to `@jgengine/react/notifications/toastStack` (still exported from `@jgengine/react`).
- The camera config's shake options type is `CameraRigShakeConfig` (was a second `CameraShakeConfig`, which still names the `createCameraShake` options).
- `appendToast`, `pruneToasts` and `createToastQueue` (`@jgengine/core/game/toasts`) are removed; push ad-hoc player messages to `ctx.game.notices` (`createNoticeFeed`).
- `findAssets` is removed; use `rankAssets(query).map((entry) => entry.match)`. Its options type is `RankAssetsOptions` (was `FindOptions`). The `assets search` command is removed; use `jgengine find <words>` or `assets add <query>`.

### Added

- `jgengine find <words>` answers where a concept lives: its home folder in each layer (core model, shell draw, react view, editor author) with the files and exports in it and the pieces outside it, read from the code itself, next to the shipped capabilities and matching assets. In a game it reads the installed `@jgengine/*` packages. `jgengine find --text <regex>` (or `--in`, `--kind`, `--glob`, `--files`) is a plain ripgrep search.
- `describeAssetMatch` (`@jgengine/assets`) prints one line for a ranked asset match.
