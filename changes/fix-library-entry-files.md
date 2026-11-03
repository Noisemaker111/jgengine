the entry-index helpers are internal tooling, and the gen-order test narrows instead of asserting

### Added

- bun run gen library-index writes each folder's index; the assets suite fails when an index misses a file or an entry's id is not its file name.
- `LIBRARY_LISTS` (`@jgengine/assets/catalogs/entryFiles`): Every shared library list kept as one file per entry. Also `LibraryList`.
- `FONT_LIBRARY` (`@jgengine/assets/catalogs/fonts`): The shipped font families, each a display or a body face.
- `LUT_GRADES` (`@jgengine/assets/catalogs/grades`): The shipped colour grades, each a recipe baked into a 32³ cube.
- `HDRI_LIBRARY` (`@jgengine/assets/catalogs/hdris`): The shipped HDRIs, each one Poly Haven asset under a plain id.
- `MATERIAL_LIBRARY` (`@jgengine/assets/catalogs/materials`): The shared library: ambientCG PBR materials plus the glass and water surfaces that need a shader rather than a scan.
- `AMBIENTCG_PINNED` (`@jgengine/assets/sources/ambientcg`): Exact upstream ambientCG materials the shared library pins, beyond the numbered family sweep. Also `AmbientcgPinnedMaterial`.

### Fixed

- the entry-index helpers are internal tooling, and the gen-order test narrows instead of asserting
- the folder-home check skips one-file-per-entry data folders, whose folders group entries rather than features
- fonts, HDRIs, colour grades, materials and pinned ambientCG scans keep one file per entry, so two branches adding the same id conflict in git instead of both landing (#2881)
