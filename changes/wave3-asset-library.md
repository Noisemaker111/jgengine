curated HDRIs, LUT grades, 40 PBR materials and OFL fonts in the asset library, each picked by id in one line

Engine seam: packages/assets/src/catalogs/curatedPull.ts, packages/assets/src/catalogs/fontLibrary.ts, packages/assets/src/catalogs/hdriLibrary.ts, packages/assets/src/catalogs/looksCredits.ts, packages/assets/src/catalogs/lutGrades.ts, packages/assets/src/cli/pull.ts, packages/core/src/postfx/cubeLut.ts, packages/core/src/postfx/gradeShader.draw.ts and 1 more

### Added

- curated HDRIs, LUT grades, 40 PBR materials and OFL fonts in the asset library, each picked by id in one line
- `CuratedJob` (`@jgengine/assets/catalogs/curatedPull`): One curated file to serve: what it is, its id and the folder under `public/` that holds it. Also `CuratedKind`, `CuratedPullContext`.
- `FONT_DIR` (`@jgengine/assets/catalogs/fontLibrary`): Where a game serves fonts from, relative to `public/`. Also `FONT_LIBRARY`, `FONT_LICENSE`, `FONT_PACKAGE_VERSION`, `FontEntry`, `FontId`, `FontRole`, `libraryFontPairing`.
- `HDRI_DIR` (`@jgengine/assets/catalogs/hdriLibrary`): Where a game serves the HDRI folder from, relative to `public/`. Also `HDRI_LIBRARY`, `HDRI_LICENSE`, `HDRI_RESOLUTION`, `HdriEntry`, `HdriId`, `hdriEnvironment`.
- `creditsForLooks` (`@jgengine/assets/catalogs/looksCredits`): Credit sections for the HDRIs, colour grades and fonts a game ships, each entry with its author and licence. Also `LooksUsed`.
- `LUT_GRADES` (`@jgengine/assets/catalogs/lutGrades`): The 16 shipped colour grades, each a recipe baked into a 32³ cube. Also `LUT_GRADE_DIR`, `LUT_GRADE_LICENSE`, `LUT_GRADE_SIZE`, `LutGrade`, `LutGradeId`, `LutGradeRecipe`, `lutGrade`.
- `formatCubeLut` (`@jgengine/core/postfx/cubeLut`): Writes a {@link LutCube} as `.cube` text (the inverse of {@link parseCubeLut}). Also `parseCubeLut`.

### Changed

- Part of #2837
