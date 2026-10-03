### Fixed

- Generated building boxes and kit meshes use spatially bounded instance batches, so distant parts no longer keep a whole settlement batch in view. The shell applies the existing resolved graphics draw distance and visibility overrides while retaining material groups, fitted geometry bounds and nearby offscreen shadow casters.
