### Added

- `jgengine upgrade --plan/--apply [--to x.y.z]` reviews and updates existing root workspace SDK catalogs from verified published versions, preserving game declarations, editor overrides, and unrelated text; installation and lockfile updates remain a separate step.

### Changed

- Upgrade reports include Rapier and Navbake, reject corrupt installed metadata, and distinguish missing migration notes or an unverified notes target from an up-to-date published SDK.
