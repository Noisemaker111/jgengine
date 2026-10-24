### Added

- `bun run check:script-help` walks every `package.json` script that points into `scripts/`, runs each with `--help`, and fails when one errors, hangs over its own timeout, prints nothing, or when a script names a file the repo does not have. Script files that predate `--help` are listed in `scripts/script-help-baseline.json` and reported, so a new one cannot arrive undocumented.
- `land`, `lane:close`, `lane:audit`, `ci-status` and `verify:fast` answer `--help` with their purpose, the flags they actually accept, one example and their exit codes, through one shared `scripts/script-help.ts`. No install, network or browser needed.

### Fixed

- `verify:fast`, `land` and `lane:close` refuse a checkout with no `node_modules` up front: they print the missing marker, the exact fix (`bun install` in this checkout, or `bun run agent:bootstrap`) and exit 78, instead of a `command not found` or a module error from a test file. A genuine failure still exits on its own code.
