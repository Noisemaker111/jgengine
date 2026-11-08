Grass style split from species: one realism slider from cartoon to photoreal, per world and per patch

### Added

- Grass style: a species says what grows, a style says how it is drawn. `realism` (0 cartoon, 0.5 animated, 1 photoreal) moves every style slider along its own curve; the first slider is `normalLift`. A world sets one style (`environment.grassStyle`, the Lighting panel, or `environment({ grassStyle })`) and a patch may override it (`style` in a `grass_field` meta or a `grass()` config)
- The inspector shows a scene kind's nested settings with the values in effect and a Clear button; grass and ground cover use it for the patch style
- Grass look fingerprints: a test pins every look the repo draws (128 species, every game volume and band, demo and reference looks) to the values from before the split

### Changed

- A scene that sets no style draws exactly as before: every curve passes through today's look at realism 0.5
