### Added

- `jgengine doctor` flags a silent game: one that neither declares `defineGame({ audio })` cues nor calls `ctx.game.audio.play`/`loop`. Four reference games shipped without a single sound; the fix text points at procedural `SoundDef` synth patches, which need no asset files.
