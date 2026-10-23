### Changed

- `bun run land` queues landings on one lock per repo instead of running them beside each other, so two lanes no longer stack two pull requests' sixteen jobs against the account's 20-job cap. A waiting landing names the branch and pid it waits on; a lock whose process died, or that is older than 30 minutes, is broken with a warning.
- The scene io browser test skips Playwright's two-frame click stability check and lets three rendered frames pass instead of ten: on a runner its second test went from 53s to 11-24s and the file from 76s to 50s, of which 16-36s is the fixture's own start.
