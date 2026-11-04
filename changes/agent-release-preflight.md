a release builds jgengine.com and runs its asset check before cutting, and stops with nothing published if that fails; 0.52.0 went to npm while the site deploy failed its bundle check, leaving npm and jgengine.com on different versions

Root cause: the release published first and built the site only afterwards, so any site failure surfaced after npm already had the version

### Added

- apps/web build:checked, the checked build deploy:cloudflare uploads and the release checks

### Fixed

- a release builds jgengine.com and runs its asset check before cutting, and stops with nothing published if that fails; 0.52.0 went to npm while the site deploy failed its bundle check, leaving npm and jgengine.com on different versions
