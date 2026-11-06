128 named grass species (GRASS_SPECIES in @jgengine/core/grass/grassSpecies) across eleven habitats, from putting greens and prairie to reed beds, cereal crops, ornamentals, moss cushions and stylised fantasy grass. A grass_field or grass() names one with species and any knob it also sets wins.

Engine seam: packages/core/src/generator/paramSchema.ts, packages/core/src/grass/GrassCover.draw.tsx, packages/core/src/grass/GrassPatch.draw.tsx, packages/core/src/grass/grassBake.draw.ts, packages/core/src/grass/grassCoverGeometry.draw.ts, packages/core/src/grass/grassField.ts, packages/core/src/grass/grassKind.ts, packages/core/src/grass/grassMaterial.draw.ts and 7 more

### Migrate

- the grass meta group species (second species) is now mix; GrassCover's stripeAt prop is now shadeAt.

### Added

- 128 named grass species (GRASS_SPECIES in @jgengine/core/grass/grassSpecies) across eleven habitats, from putting greens and prairie to reed beds, cereal crops, ornamentals, moss cushions and stylised fantasy grass. A grass_field or grass() names one with species and any knob it also sets wins.
- grass knobs for blade twist, tip droop, V-fold, tuft splay, moss cushion domes, variegated margins and cross bands, spike seed heads (headShape) and a resting wind lean.
- a param schema can name a presetKey; the meta id there backs every unset field (presetBackedMeta), and the editor inspector groups presets under headings and shows the current one.
- `presetBackedMeta` (`@jgengine/core/generator/paramSchema`): A `meta` bag with its {@link ParamSchema.presetKey} preset filled in under it: the preset's values, then the meta's own keys on top.
- `GrassSpeciesKnobs` (`@jgengine/core/grass/grassKind`): A knob set a species writes: any knobs, never the seed.
- `GRASS_SPECIES` (`@jgengine/core/grass/grassSpecies`): Every shipped grass species, grouped by habitat. Also `GrassSpecies`, `GrassSpeciesId`.

### Changed

- beacon-bastion, brightway-park, ember-command, fernwild, harbor-heat and scrap-signal grass fields now name a species picked for their setting, and the grass-looks demo lays out every species.
- the engine bundle budget rises to 1880 KiB for the grass species table every grass field reads.
