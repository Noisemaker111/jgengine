### Added

- `PerfReport.render.drawsFrame` is every draw a frame issues — shadow, main, postfx prepasses, AO and DOF together — as the 95th percentile of the measured window, with `drawsFrames` naming how many frames it covers. `bun run perf:gate` compares it against each game's re-based `drawsFrame` budget; the renderer's own single-sample `draws` is printed beside it and is no longer gated.

### Changed

- Each game's `perf-budget.json` entry now budgets `drawsFrame` and records the budget it replaced as `previousDraws`; an entry that still carries only `draws` fails by name instead of gating a count from a different measurement.
- The in-page report reads the devtools render probe's frame sample instead of the live renderer counter, so `window.__JG.report()` and the devtools panel no longer report a mid-frame partial count.
