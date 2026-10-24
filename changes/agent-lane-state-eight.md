### Fixed

- `createCastRunner.state()` carries the cast's `moveTolerance`, `moveDeadzone` and `movedTotal`, and `restore(next)` resumes it. A cast saved mid-fight used to come back with a fresh movement budget, so the caster could walk further than the ability allowed.
- `createDecayMeterSet.serialize()` / `restore(next)` carry each meter's value, base rate and `setRateModifier` multiplier. A save used to drop a tuned rate, so a cold biome's faster warmth drain reset to the config rate on load.
- `createAreaEffectField.restore(state)`, `createSelectionBookmarks.restore(snapshot)` and `createPlotPermissions.restore(snapshot)` are the state-in counterparts to their existing `serialize()` / `snapshot()`; restoring into a live field releases the members the saved state does not carry.

### Changed

- `check-stateful-ratchet` skips a factory carrying `// stateless: <reason>`, the named case for a catalog whose only closure state is an index of its own config. `createBuildSocketCatalog` declares it instead of being baselined.
