### Fixed

- `jgengine doctor` resolves default and named Bun workspace catalogs before checking SDK version alignment, reports missing or malformed catalog entries, and recognizes hoisted SDK installs.
- `jgengine upgrade` reads hoisted installed packages, uses resolved catalog pins when packages are not installed, and identifies the workspace catalog that owns an upgrade. The command remains a read-only migration report.
