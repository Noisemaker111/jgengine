### Fixed

- Capture runs no longer leak a ~150 MB temp Chrome profile each. `shoot`, `drive` and `perf` delete their profile on every exit path — success, throw, watchdog and SIGINT — `bun run shoot` reclaims profiles a killed run left untouched for three hours, the capture guard sweeps the profile of a run it force-kills, and the generated `browser.mjs` harness for game repos removes its own. A capture also refuses to start when the temp drive has less free space than it needs.
