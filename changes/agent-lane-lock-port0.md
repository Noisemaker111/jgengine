two captures or drives started together no longer fight over one browser debugger port: every launcher starts Chrome on port 0 and reads back the port it published, including the games capability probe

Root cause: ports were picked from a 700-port range before launch (random or clock-based), so parallel runs could pick the same one; lane:close had no per-worktree lock

### Added

- lane:close runs once per worktree; a second run is refused with exit 4 and names the run that holds it, and a lock left by a crashed run is broken on its own

### Fixed

- two captures or drives started together no longer fight over one browser debugger port: every launcher starts Chrome on port 0 and reads back the port it published, including the games capability probe
