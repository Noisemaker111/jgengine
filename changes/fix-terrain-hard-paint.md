Hard terrain paint after a blend makes the painted layer dominate, and the saved scene keeps clean weights

Closes #1981

### Fixed

- Hard terrain paint (brush, `fillSurfaceDelta`, clear, `autoPaintDelta`) on a blended terrain now sets the painted layer's weight to 1 and every other layer's to 0 in each touched cell, so `surfaceAt` and the renderer show it; before, it changed only the surface id and the old blend weights kept winning, also after save and reload. `SurfaceDelta` carries the reset slots as an optional `weights` (`WeightDelta`), so `paintTerrain` undo/redo, `applySurfaceDeltaToSnapshot` and `revertSurfaceDeltaFromSnapshot` restore both channels. Clearing, or painting a surface outside the layer stack, zeroes the cell's weights so its id shows through.
