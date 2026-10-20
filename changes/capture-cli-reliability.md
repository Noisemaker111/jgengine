### Added

- `debug_summary` agent-bridge verb and `debug_snapshot` `detail: "summary"`: fps, frame/sim ms, draw calls, triangles, entities, warnings and top culprit in about 1 KB. `drive --rpc '{"method":"debug_snapshot"}'` prints the summary; `"detail":"full"` keeps the full snapshot.
- `modelLoadStarts()` (`@jgengine/shell/render/modelLoad`) counts model streaming bursts for capture quiescence checks.
- `jgengine` warns when it is not the CLI the caller meant: a global install run inside a jgengine checkout, a project-local `jgengine` shadowed, or a CLI built for an older SDK than the project installs. Harness runs print the CLI version and harness revision.

### Changed

- `bun run shoot/drive` and the scaffolded/bundled `shoot.mjs`/`drive.mjs` parse one shared flag table: `--click-at`, `--right-click-at`, `--width`, `--height`, `--port`, `--size`, `--settle`, `--param`, `--probe`, `--reload`, key chords and mouse holds work in both; unknown flags fail instead of being ignored or taken as a game id; dev-runner-only flags are refused by name in the portable harness.
- Play-mode capture readiness waits until staged `--state`/`--run` commands have ticked, their entities mounted and model streaming stopped, and never declares ready over "Loading game view…". A rejected staged command fails the capture.
- Play-mode captures of a game with a start menu and no `capture.play` click its start action and report what they clicked.
