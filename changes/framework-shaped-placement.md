### Migrate

- Shaped-grid dimensions must be positive safe integers; footprint cells and placement origins must be finite safe integers. Empty or fractional footprints and invalid quarter-turn rotations reject before overlap checks.

### Added

- Discoverable shaped-grid placement operations and bounded first-fit search with caller-ordered rotations, row-major positions, and distinct no-space/budget results.

### Fixed

- Shaped grids reject nonfinite/fractional dimensions, origins, and footprint cells instead of admitting non-discrete placements.
