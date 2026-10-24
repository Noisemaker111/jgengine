### Added

- `shoot`, `drive` and `perf` take `--quality <low|medium|high|ultra>` and pin that graphics tier on the game page (`?quality=<tier>`). Each run reads the tier back from the shell (`data-jg-quality`) and fails when it is missing or different, so a capture or perf record always names the tier it measured. Every capture summary prints `tier <tier>`; `perf` echoes `perf: tier <tier>` and records it in `quality`.
- The old `--quality draft|full` iteration mode is now the `--draft` switch (low tier, half viewport, `-draft` file names), on `shoot`, `drive` and `perf`; `perf:gate` takes `--draft` too. An unknown `--quality` value fails naming all four tiers.

### Changed

- A capture at a non-default tier writes its tier into the file name (`-low`, `-medium`, `-ultra`), so an ultra shot cannot overwrite the high one it was compared against.

Root cause: `--quality` carried the iteration preset, not the graphics tier, so a culling lane that asked for ultra got the game's default `high` on both sides of its comparison and could not prove a tier claim.
