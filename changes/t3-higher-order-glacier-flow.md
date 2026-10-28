a first-order (Blatter–Pattyn) Stokes ice-flow solver, createFirstOrderIceFlow, that matches the ISMIP-HOM full-Stokes benchmarks within one standard deviation

Closes #2759

### Migrate

- landform snapshots are version 3 and carry iceFlux; older snapshots no longer restore

### Added

- a first-order (Blatter–Pattyn) Stokes ice-flow solver, createFirstOrderIceFlow, that matches the ISMIP-HOM full-Stokes benchmarks within one standard deviation
- GlacialParams.model picks first-order or shallow-ice glaciers, with layers and erosionExponent
- `createFirstOrderIceFlow` (`@jgengine/core/landform/glacial/firstOrderIceFlow`): A first-order (Blatter–Pattyn) Stokes ice-flow solver for a plan grid. Also `FirstOrderGrid`, `FirstOrderIceFlow`, `FirstOrderInput`, `FirstOrderOptions`, `FirstOrderReport`.
- `GlacierModel` (`@jgengine/core/landform/glacial/glacierFlow`): Which ice model moves a glacier.

### Changed

- Landform glaciers default to first-order flow, which drags ice on the valley walls so a V valley turns into a U (cross-section exponent 1.0 to 2.05 over 40 kyr, as Harbor 1992 found)
- Glacial till now travels down the ice surface to the glacier's snout
