the city layout (cityLayout.ts) from core; Harbor Heat, its only adopter, owns it under engine-local with framework-ok. The city scene kind stays in core: Ember Command uses it.

Engine seam: none - game content only

### Changed

- Part of #2837

### Removed

- the city layout (cityLayout.ts) from core; Harbor Heat, its only adopter, owns it under engine-local with framework-ok. The city scene kind stays in core: Ember Command uses it.
- `@jgengine/core/city/cityLayout` no longer exports `CITY_ZONES`, `CityLayout`, `CityLayoutDriveway`, `CityLayoutLot`, `CityLayoutPatch`, `CityLayoutStore`, `CityLotOptions`, `CityLotRoad` and 15 more.
