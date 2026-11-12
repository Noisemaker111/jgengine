City layout, streets and race circuits are generators on the generator contract

Closes #2690
Closes #2691

### Migrate

- `generateStreets(rules, hx, hz, context)` is gone: run `STREET_NETWORK_GENERATOR` (`@jgengine/core/roads/streetGenerator`) with `runGenerator(STREET_NETWORK_GENERATOR, { ...dials, halfX, halfZ, seed, bridges?, tunnels?, minElevation?, tunnelClearance? }, { input: { heightAt } })`. `StreetNetworkRules` and `StreetNetworkContext` are replaced by `StreetNetworkParams` (the parsed `STREET_NETWORK_SCHEMA`) and `StreetNetworkInput`; the `net` and `circuit` presets are on the schema. The dead `outline` and `residentialBranches` dials are dropped from the street generator.
- `StreetNetwork.elevationAt` is gone; the output is plain data. Rebuild the road-surface field with `streetElevationField({ elevation, halfX, halfZ }, seed)`.
- `extractCircuitRoute(network, rules)` takes `(network, params, { seed })`: parse the lap dials with `parseParams(CIRCUIT_ROUTE_SCHEMA, { lapLength, ... })` and pass the seed of the generator that grew the streets. `CircuitRouteRules` and `CIRCUIT_ROUTE_DEFAULTS` are replaced by `CircuitRouteParams` and the schema defaults. `RACE_CIRCUIT_GENERATOR` grows the streets and lifts the lap in one call.
- `CITY_DEFAULTS` and `readCityRules` are gone: `CITY_SCHEMA` is a `defineParamSchema` and `CityRules` is derived from it. The legacy `buildingDensity` meta key no longer maps onto `roadsideOccupancy`/`blockDensity`; set those keys.

### Added

- `GeneratorContext.input`: a generator declares world data its output depends on that a meta bag cannot hold (`GeneratorDefinition<Schema, Output, Input>`), and `runGenerator`/`prepareGenerator` pass it with `{ input }`. It is undefined in the variant grid.
- `CITY_GENERATOR` (`city`, output `city`), `STREET_NETWORK_GENERATOR` (`streets`, output `street-network`) and `RACE_CIRCUIT_GENERATOR` (`race-circuit`, output `race-circuit`) are registered with the city kind, the `city` kind names its generator, and each output family has a variant-tile preview, so `generator_variants` rolls districts, street nets and laps.
- `CityLot.seed`: each lot's seed, derived from the district seed; the city renderer seeds near-detail buildings and wall paint from it.

### Removed

- `scripts/check-street-rule-parity.ts`: the city now hands the street generator a typed `StreetNetworkParams`, and `generate_streets` overlays any street-schema key, so the compiler holds the parity the gate checked.

### Fixed

- Every city lot with the same id (`lot:0:3`) drew the same near-detail building and wall paint in every district; they now vary with the district seed.
