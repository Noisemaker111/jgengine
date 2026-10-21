### Migrate

- The frame panel from `@jgengine/react/hudPanel` is now `HudSurface` in `@jgengine/react/hudSurface` (`HudSurfaceProps`, `HudSurfaceElevation`). `HudPanel`, `HudPanelProps` and `HudPanelElevation` from `@jgengine/react/hudPanel` stay as deprecated aliases for this release. The `HudCanvas` layout slot keeps the name `HudPanel`.
- Engine HUD control sounds (button click/hover, panel and window open/close) no longer turn off with `notices: false` or `notices.cues: false`. Set `audio.hudCues: false` to silence them; `notices.cues` now covers notice sounds only.
- The notice stack now defaults to z-index 85 (was 45), above `ModalHost`. Pass `notices.zIndex` to put it back under a game overlay.

### Added

- `HudSurface` takes `as` (`section`, `aside`, `nav`, ...) to render as a landmark.
- `notices.offset`, `notices.avoidHud` and `notices.zIndex`, with matching `NoticeStack` props. The offset adds to the device safe-area inset.
- `ctx.game.notices.push({ text, silent: true })` shows a notice without its sound.

### Changed

- The engine stylesheet (`@jgengine/react/styles.css` and the injected copy) sits in the `components.jgengine` cascade layer, after a `theme, base, components, utilities` layer order, so plain game CSS and Tailwind utilities override engine buttons and panels without `!important`.
- `HudSurface` padding comes from `--jg-panel-padding` (default 12px); the `padding` prop sets that variable instead of an inline `padding`, so a game class or media query can override it.
- `HudButton` labels wrap (`white-space: normal`, line height 1.2, 4px vertical padding) instead of overflowing on one line.
- The shell renders the notice stack inside the HUD theme root, so notices use the game's `hudTheme` colours and font.
- A top or bottom notice stack moves clear of `HudCanvas` panels and touch controls registered in its column (Harbor Heat's courier card, action bars).

### Fixed

- Flowing `HudCanvas` panels now register their layout region once their anchor region mounts; before, most never registered, so layout collision checks and region consumers missed them.
