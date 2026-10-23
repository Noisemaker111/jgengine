### Added

- `--quick` on `bun run shoot` and `bun run drive` is the 960x540 iteration preset: one settled frame (a 2s settle window in drive), no video, no perf pass, written as `<name>-quick.png` and timed on its own line. It refuses a 1600x900 pixel claim, a frame-time claim, a non-desktop device and a recording flag by name instead of producing weaker evidence; full stays the default for PR shots. On a warm daemon a two-shot `drive` of ember-command went 9.3s to 8.2s and 4316KB to 1383KB of PNG.
