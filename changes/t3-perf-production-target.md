bun run perf <game> --production, perf ab --production and perf gate --production time the build players get (the runner as the web deploy builds it: minified, bundled, production React, built once per tree and served locally); the dev server stays the default, and the gate's budgets and baselines are unchanged

### Added

- bun run perf <game> --production, perf ab --production and perf gate --production time the build players get (the runner as the web deploy builds it: minified, bundled, production React, built once per tree and served locally); the dev server stays the default, and the gate's budgets and baselines are unchanged
- every perf and perf ab report leads with a scorecard: frame p50, p95, p99 and the worst frame, frames over 16.7 and 33 ms, main-thread ms per frame with the share inside React and react-three-fiber, MB allocated per second and GC time, the same frames with the CPU slowed 4x, load time and download size; --tally <group> records it in the local tally store

### Changed

- The repo's AGENTS.md perf rule and the perf docs say a claim about what players experience comes from a --production run and quotes the scorecard. The dev-against-production comparison was not run (Jon, 2026-11-09)

### Fixed

- a production build of the runner bundled every game's tests and standalone main.tsx (the glob exclusions only held in the dev server), so opening a game ran its tests and mounted a second React root that crashed the first; jgengine.com's current build has the same 480 test chunks and 9 game entries and needs a release to get the fix
