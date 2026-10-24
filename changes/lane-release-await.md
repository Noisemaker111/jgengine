### Added

- `bun run release --wait` finishes a release instead of handing it back: it commits the cut, hands the PR to `land` (push, open or update, arm auto-merge), waits for the merge, fast-forwards `main`, waits for the Publish run and prints `release: published @jgengine/core@<version> (publish run <id>)`. A failed run prints `release: publish run <id> failed at job "<job>" at step "<step>" <url>` and exits 1. A release lane spent 265 minutes in 24 h in `Start-Sleep 480; gh run view …; npm view …` loops around this step.
- `bun run release:await [<version>] [--run <id>]` is the wait on its own, for a version that is already cut; it answers from the registry, not from the workflow's own success message, so a run that reported success without the version on npm is a failure that names both.

### Fixed

- `bun run ci:status` answers a branch with no PR with one line on stdout, `ci:status: no open PR for <branch> on <owner/name> - nothing to answer`, and still exits 3. The line used to go to stderr only, so a lane that reads stdout saw silence and fell back to polling.
