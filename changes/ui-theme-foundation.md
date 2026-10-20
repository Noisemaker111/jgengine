### Added

- `HudTheme` gains a type scale with a 12px floor, spacing, motion (durations and easings), elevation (layered shadows and a lit top rim), and hover/press/focus/disabled state tokens; `hudThemeVars` emits them as `--jg-type-*`, `--jg-space-*`, `--jg-motion-*`, `--jg-ease*`, `--jg-elevation-*`, `--jg-highlight`, `--jg-hover-*`, `--jg-press-*`, `--jg-focus-ring`, and `--jg-disabled-opacity`. `@jgengine/react/hudTokens` reads them in inline styles (`hudType`, `hudSpace`, `hudTransition`, `hudElevation`, `hudFont`, `HUD_FOCUS_RING`).
- Engine stylesheet `@jgengine/react/styles.css` (also `ENGINE_STYLESHEET` / `useEngineStyles` in `@jgengine/react/engineStyles`): every `jg-*` keyframe the shared blocks and registry use, `[data-jg-*]` interaction states, quiet hover/press/focus defaults for plain HUD buttons, and reduced-motion handling for `prefers-reduced-motion` and `[data-reduced-motion="true"]`. The `jgengine create` template imports it.
- `HudThemeRoot`: the shell wraps every `GameUI` in it, applying `defaultHudTheme` and the stylesheet. `defineGame({ hudTheme })` swaps the root theme; `hudTheme: false` opts out.
- Primitives `HudButton`, `HudPanel` (open/close transition via `usePresence`), and `TweenNumber` / `useTweenedValue` with an up/down delta flash; `useReducedMotion` in `@jgengine/react/accessibility`.
- `HudInteractProvider` / `useHudInteract`, plus `cue` and `onInteract` on the primitives, windows, modals, and `ActionButton`: one seam for a UI sound system.

### Changed

- `defaultHudTheme` is the engine's default look: a system UI font stack led by Inter, layered translucent panels with a lit rim and hairline borders, and gradient slots.
- `Window` / `PanelHost` render on `HudPanel` with enter and exit transitions and a `HudButton` close; `ModalHost` fades its backdrop and lifts its dialog, with an exit; `ConfirmDialog` / `PauseMenu` use `HudPanel` and `HudButton`; `HudFrame` and `ActionButton` read the font, elevation, focus, and motion tokens.
- Text under 12px in `@jgengine/react` and `registry/jgengine` now uses the type scale's `xs` step (12px floor).
