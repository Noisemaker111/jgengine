Roads that look alike draw as one draw per layer (asphalt, gutter, lane paint, sidewalk, kerb), and every road junction of one colour is one draw: a street grid no longer costs five draws per street.

### Added

- `RoadPiece` (`@jgengine/core/roads/RoadRibbons.draw`): One road's share of a merged draw: its trimmed centreline sub-paths and the base height they drape at.

### Fixed

- Roads that look alike draw as one draw per layer (asphalt, gutter, lane paint, sidewalk, kerb), and every road junction of one colour is one draw: a street grid no longer costs five draws per street.
- Crowd characters that differ only in paint colour (traffic resprayed four ways) share one instanced draw per material, each drawing its own colour.
- Shared static-prop batches are culled whole by their cell instead of re-culling, re-sorting and re-uploading every instance in every render pass and shadow cascade.
- Foliage sway ramps over the model's own measured height, so one plant placed at several sizes sways alike and shares one batched draw.
