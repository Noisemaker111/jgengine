### Added

- Positioned sounds are placed around the head by default (`audio.panning`, default `"hrtf"`; `"equalpower"` is a cheaper stereo pan, `"off"` keeps them centred). Distance loudness still follows each sound's `falloff`; a sound's own `spatial` block still wins.
- World reverb on positioned sounds, on by default (`audio.reverb`): authored zones (sphere or box, preset `room`, `hall`, `cave`, `outdoor` or `none`) win; elsewhere the shell casts six wall rays and one ceiling ray around the player twice a second and picks room, hall or outdoor. Changes of space blend over about a second. Each bus feeds the reverb through its own level, so muting a bus silences its echo. `reverb: false` keeps everything dry.
- One-shots (gunshots, impacts) that start behind geometry now play quieter and muffled, on their own budget of 6 line tests per 100 ms.
- Adaptive music (`audio.adaptiveMusic`, off by default): hits the local player deals or takes raise an intensity that decays in quiet, and the tiers crossfade the built-in explore, tension and fight themes (`ADAPTIVE_THEMES`), or the game's own tiers. `audio/adaptiveMusic` probe.
- `window.__jgengineAudio.spatial()` reports panned voices, reverb sends, muffled one-shots and the current space.

### Fixed

- A retained loop started without a position is no longer occlusion-tested from where it began, so a world-wide bed is not muffled when the player walks behind a wall.
- `ctx.game.audio.intensity(amount)` (event `audio.intensity`) lets a game with no avatar of its own (a tower defense, an RTS) raise the adaptive soundtrack: a released wave, raiders on the field.
- `audio/enclosure` probe shows the ceiling and wall distances behind the automatic reverb choice.
