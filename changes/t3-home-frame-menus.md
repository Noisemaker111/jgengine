home page game frame shows the whole title menu; phones play full screen

Closes #3159

Closes #3160

### Added

- `DEV_REPORT_COOKIE` (`@jgengine/core/devtools/reportEndpoint`): Cookie the dev servers set on the pages they serve, so a page asks for the report route only where it exists. Also `servedByDevServer`.

### Fixed

- home page game frame shows the whole title menu; phones play full screen
- no /__jgengine/report 404 on shipped games
