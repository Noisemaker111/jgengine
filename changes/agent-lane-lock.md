two capture runs on one machine no longer share a Chrome debugger port. The bundled shoot and drive harness, the engine's startBrowser and every capture that used a random 9200-band port now launch Chrome on port 0 and read back the port it published, so two verify or lane:close runs cannot fail each other's browser handshake

### Added

- lane:close runs once per worktree. A second run started while the first is still going is refused with exit 4 and told which run holds the worktree (branch, pid, start time); a lock left by a crashed or killed run is broken by the next run on its own

### Fixed

- two capture runs on one machine no longer share a Chrome debugger port. The bundled shoot and drive harness, the engine's startBrowser and every capture that used a random 9200-band port now launch Chrome on port 0 and read back the port it published, so two verify or lane:close runs cannot fail each other's browser handshake
