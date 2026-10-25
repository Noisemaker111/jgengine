### Added

- `createRadio` (`@jgengine/core/audio/radio`): serializable car-radio stations (music, talk, news) on one shared clock, so tuning back lands mid-programme. Tune next/previous/off, a priority bulletin queue fed by game events with per-topic cooldowns, expiry and break-in, per-station wording, a `nowPlaying` view for the HUD, and `snapshot`/`restore`/`retune`.
- `createRadioPlayback` (`@jgengine/core/audio/radioPlayback`): drives a radio's cues into a sink — generated music themes with a start offset, spoken lines with per-voice pitch and rate — and pauses with the game.
- `ctx.game.audio.speak(text, options)`, `stopSpeech()` and `duck(id, bus, amount)`, plus `music(theme, transpose, { offset })`. The shell speaks through Web Speech on the game's `audio.speechBus` (text-only when no voice exists), holds keyed bus ducks, and starts a theme partway in.
- `window.__jgengineAudio.speech()` reports whether speech is available, how many voices, and lines spoken and dropped.
