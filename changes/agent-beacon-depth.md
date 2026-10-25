### Added

- `upgradePathActions`, `upgradePathFacts`, `upgradeOptions` and `upgradeProgress` (`@jgengine/core/worldModel/upgradePaths`) compile a placed kind's upgrade ladder - a shared trunk, then exclusive branches - into world actions, and list the next steps an instance can take with the world's price and refusal.
- `createWaveCountdown` (`@jgengine/core/ai/director/waveCountdown`) runs the intermission between waves: the next wave goes out when it runs down, and `callEarly()` prices the seconds skipped.
- `summarizeWave` (`@jgengine/core/ai/director/wavePreview`) totals an authored wave's units by first arrival, with trait counts and the entries it uses, for a preview card or a balance test.
- `AutoTargetDeps.eligible` keeps a picker off candidates it cannot hit; `nextAutoTargetPolicy` and `AUTO_TARGET_POLICIES` step a player-chosen targeting priority.

### Fixed

- Saving the scene (`save_scene`, Ctrl+S) or tuned values while the dev runner serves a game with `--game-dir` now writes into that checkout. It used to write into `Games/<id>`, editing a different checkout than the one on screen.
