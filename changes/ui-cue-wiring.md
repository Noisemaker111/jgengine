### Changed

- The shell plays UI cues for every engine HUD primitive (`HudButton`, `HudPanel`, `Window`, `ModalHost`, `ActionButton`): activate → `click` (or the primitive's `cue` when it names a cue, e.g. `cue="confirm"`), button/action hover → `hover`, panel open/close → `open`/`close`. Off with `notices: false` or `notices.cues: false`; `audio.uiCues` silences single cues. `uiCueForInteraction` (`@jgengine/react/uiCues`) exposes the mapping.
