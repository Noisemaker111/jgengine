### Added

- Editor-authored grass exposes blade width and bend ranges, tuft radius and normal lift, using the same bounded grass renderer as environment fields. Existing scene documents keep their previous shape and lighting defaults.

### Fixed

- Grass volumes sample terrain at their authored world position and subtract their placement height once, keeping translated patches rooted on slopes instead of buried underground.

- Authored grass respects spawn, objective and road/path clearances with feathered regrowth outside the usable footing. Diagonal paths keep their own corridor clear without clearing the entire surrounding rectangle.
