### Added

- `combat.damage` carries an optional `position`: the effect path fills it from the target's own spot, and `createDamageRuntime` takes one per hit (`hit({ position })`) or from a `positionOf` reader, so a status tick is placed too. A cue with a position pans and attenuates; one without stays centred.
- `createHapticsRoute` (`@jgengine/shell/audio/hapticsRoute`) sends a feedback pulse to a connected gamepad, and to `navigator.vibrate` on a phone with no pad. `FeedbackHost` wires it; reduced motion still drops the camera shake only.

### Changed

- `FeedbackDeps.play` takes an optional `position`, which `FeedbackHost` forwards to `ctx.game.audio.play`, so a positioned damage or death cue reaches the spatial engine.
