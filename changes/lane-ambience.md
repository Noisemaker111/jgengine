### Added

- `audio.zones` (`@jgengine/core/game/playableGame`): a scene declares world-space ambience zones, one looping bed per zone. The shell crossfades bed levels from the listener position on each sound's own bus, so entering, leaving and walking between zones hand over instead of cutting.
- `audio.occlusion` (`@jgengine/core/audio/occlusion`): budgeted geometry occlusion for retained positional loops. A blocked line attenuates the loop and darkens it through a low-pass; the per-tick test budget and interval bound the cost, and a loop that cannot be tested stays on distance-only.
- `SoundDef.duck`: a cue can lower named buses for its own duration. `AudioEngine.duck` returns a release, and the player's own gain is restored exactly even when they move the slider mid-duck.
- `AudioEngine.ambience()`, `AudioEngine.occlusionStats()` and `window.__jgengineAudio` report the zone mix, the newest occlusion test and the measured per-test cost for capture and diagnostics.
