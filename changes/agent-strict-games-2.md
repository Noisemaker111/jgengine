### Changed

- ember-command, drift-foundry and brightway-park now pass the strictest type settings. Their catalogs name their ids, so a mistyped unit, building or research id is a type error, and save loading reads old saves without casts.
- New `@jgengine/core/data/untyped` (`isRecord`, `isFiniteNumber`, `recordOf`) narrows parsed JSON and old saves without casts. New `slotText`/`slotNumber` in `@jgengine/core/save/saveSlots` read a save slot's chips.
- `ModelConfig.dims`, `ModelBodySource.dims`, `DrivableVehicleOptions.modifiers`, `BuildingSurfaceMaterial.roughness`/`metalness` and the kit objective's `steps`/`deadline` accept an explicit `undefined`.
