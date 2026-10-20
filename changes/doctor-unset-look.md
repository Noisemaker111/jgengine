### Fixed

- `jgengine doctor` now flags a 3D game that sets neither a `look` preset nor `postProcessing`; such a game renders the unstyled `"neutral"` look with no tone-map grade, AO or bloom. Its fix text no longer claims cinematic is the default. Write `look: "neutral"` when unstyled output is deliberate.
- `jgengine create` scaffolds name `look: "cinematic"` explicitly, so a new 3D game starts graded instead of on the unstyled default.
