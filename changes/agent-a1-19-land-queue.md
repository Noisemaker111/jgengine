### Changed

- `bun run land` queues landings on one lock per repo instead of running them beside each other, so two lanes no longer stack two pull requests' sixteen jobs against the account's 20-job cap. A waiting landing names the branch and pid it waits on; a lock whose process died, or that is older than 30 minutes, is broken with a warning.
- The scene io browser test skips Playwright's two-frame click stability check and lets three rendered frames pass instead of ten, which takes the slowest CI job's test time from 76s to under a minute on a runner.
