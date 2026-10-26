### Migrate

- `GrassField` is replaced by `GrassPatch` (`@jgengine/shell/terrain`), which takes `look` (from `readGrassLook`) and `groundColor`. Its `budget`, `distanceFade`, `segments`, `tuftBlades` props are gone: cost follows the camera, and the look carries blade count and shape.
- `GrassRules` / `readGrassRules` are now `GrassLook` / `readGrassLook`, and `grass()` descriptors carry `look` instead of `rules`. Renamed knobs: `colorBase` → `baseColor`, `colorTip` → `tipColor`, `colorVariation` → `valueNoise`, `tuftRadius` → `tuftSpread`, `accentShare`/`accentHeight`/`accentColor` → `mixShare`/`mixHeight`/`mixColor`. `bladeWidthMin`/`bladeWidthMax` become `bladeWidth` + `widthVariation`; `bladeBendMin`/`bladeBendMax` become `curvature`.
- `density` is now 0..1 fullness, not blades/m²: blades per m² follow from blade size (`grassBladeDensity`), so no value comes out sparse. `GRASS_MIN_DENSITY` and `GRASS_BLADE_BUDGET` are removed; `ScatterCoverageSpec.budget` is `null` for grass.
- `createGrassBladeGeometry`, `resolveGrassBladeGeometryOptions`, `resolveGrassRange`, `DEFAULT_GRASS_WIND` and `resolveGrassWind` are removed with the old renderer.

### Added

- A new grass system: `GrassPatch` streams each patch around the camera (`GrassStream`, a quadtree over 8 m cells), drawing every tuft up close, a screen-density share further out (`GRASS_SCREEN_DENSITY`), fewer blade segments far away, and nothing past where a blade is under a pixel. Cost is bounded by the view, not the patch area.
- Grass looks: blade `profile` (needle → strap → broad leaf), `curvature`, `stiffness`, `tuftBlades`, tip `gradient`, `hueNoise`, `season`, `seasonNoise`, `dryness`, `noiseScale`, a second species (`mixWidth` too), flowers (`flowerShare`, `flowerSize`, `flowerColor`, `flowerColor2`), `patchiness`, `slopeThin`, `windDirection` and `translucency`. `GRASS_PRESETS` (meadow, lawn, prairie, marsh, alpine, autumn, scrub, jungle) are schema presets the inspector applies in one click.
- `grass-looks` dev demo: ten looks from the same knobs side by side.
