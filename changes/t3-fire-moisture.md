fire/ fuel moisture over time from weather: NFDRS 1978 dead fuel time lags, sun and rain, Jolly 2005 live green-up, as a fire moisture field

### Added

- fire/ fuel moisture over time from weather: NFDRS 1978 dead fuel time lags, sun and rain, Jolly 2005 live green-up, as a fire moisture field
- `DEFAULT_FUEL_MOISTURE_TUNING` (`@jgengine/core/fire/fuelMoisture`): NFDRS 1978 dead fuel lags and rain boundaries, NFDRS 2016 live fuel ranges. Also `FuelMoistureModel`, `FuelMoistureSnapshot`, `FuelMoistureTuning`, `MoistureWeather`, `createFuelMoistureModel`, `equilibriumMoistureContent`, `fuelLevelWeather`, `growingSeasonIndex` and `vaporPressureDeficit`.
- `decodeFireArray` (`@jgengine/core/fire/fireArrays`): Decode base64 from {@link encodeFireArray} into a typed array of the same byte length. Also `encodeFireArray`.

### Changed

- Part of #2741
