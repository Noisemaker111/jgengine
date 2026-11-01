Fixed: Ember Command looks like its art direction: one character and village family, dressed ground, its sky, grade, fonts and parchment kit, its own menu, settings and credits

Part of #2837

Engine seam: packages/assets/src/catalogs/fontLibrary.ts, packages/assets/src/catalogs/lutGrades.ts, games/shared/provisionAssets.ts

### Added

- `autumn-painterly` colour grade, `im-fell-english-sc` and `alegreya` fonts in the look library. The `dusk` HDRI is already Poly Haven `qwantani_dusk_2_puresky`.
- Ember Command's units, buildings and props are Quaternius models (RPG Characters, Medieval Village and Buildings, Fantasy Props), team-tinted; autumn Stylized Nature forest, leaf litter and crop fields in the scene; horizon smoke, torch fire, drifting leaves, crows and banners in the wind.
- Ember Command's parchment kit with the wax red accent, the golden mood, dusk sky at 0.7, the grade, and credits for every pack, sky, grade and font.

### Fixed

- The dev server config no longer imports the material library, so it loads without a built `@jgengine/core`.

### Removed

- Ember Command's primitive-built GLBs, `author-models.mjs`, bundled font files and the unused deepward GLBs.

Before and after, 3D world at the low tier (desktop 1600 wide, phone 390 wide):

| | Before | After |
|---|---|---|
| Desktop | ![](https://github.com/Noisemaker111/jgengine/blob/wave3/look-ember-command/changes/media/wave3-look-ember-command/before-desktop.png?raw=true) | ![](https://github.com/Noisemaker111/jgengine/blob/wave3/look-ember-command/changes/media/wave3-look-ember-command/after-desktop.png?raw=true) |
| Phone | ![](https://github.com/Noisemaker111/jgengine/blob/wave3/look-ember-command/changes/media/wave3-look-ember-command/before-phone.png?raw=true) | ![](https://github.com/Noisemaker111/jgengine/blob/wave3/look-ember-command/changes/media/wave3-look-ember-command/after-phone.png?raw=true) |

Not done or caveats:
- Ground054 (war-road) and Rock035 (cliffs) are not in the material library and ambientCG is blocked from here; the road uses packed dirt (Ground025) and cliffs Rock022. Grass004 and Ground037 are used.
- `bun run perf ember-command` could not run here (software GL times out on a shader error that predates this branch), so frame time is unmeasured.
- The medium and high tiers could not be captured. Grass004's scan failed to decode in the headless capture, so the after shot shows the procedural ground colour.
- Whole buildings come from the older Quaternius Medieval Village Pack and Modular Medieval Buildings; the MegaKit is modular pieces only.
