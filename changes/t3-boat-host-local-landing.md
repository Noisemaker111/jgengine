on the boat host (~/.agents-pc/host-AGENTS.md, or JG_BOAT_HOST=1), verify:fast and lane:close run every step on the host itself, with no boat machine and no fairshare: type-checks, gates, tests, the site build, game boots in headless Chrome on software WebGL, and model-reading tests against the host's asset store

### Added

- on the boat host (~/.agents-pc/host-AGENTS.md, or JG_BOAT_HOST=1), verify:fast and lane:close run every step on the host itself, with no boat machine and no fairshare: type-checks, gates, tests, the site build, game boots in headless Chrome on software WebGL, and model-reading tests against the host's asset store
- steps only Jon's PC can run (Windows-only test files, PC GPU/CPU measurements) are not run on the host and never reported passed; verify:fast names each with its command and exits 76, and lane:close pushes and opens the PR, merges nothing and prints the command a PC thread runs

### Changed

- model-reading and Windows-only test files get a verify:fast step each, so the host runs the first and leaves only the second
