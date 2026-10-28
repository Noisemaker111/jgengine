glaciers follow the LR04 glacial cycles: snowlineHistory scales the snowline by the benthic δ18O stack (Lisiecki and Raymo 2005, CC BY), and GlacialParams.elaHistory feeds it to a run

Root cause: the explicit shallow-ice relaxation never converged on 100 m mountain grids (residual near 65 m/yr), and per-face directional flux ratios dammed first-order ice into cliffs

Refs #2778

### Migrate

- landform snapshots are version 4 (iceEastScale and iceSouthScale replace iceFlux); GlacialParams.iceYears and iceSteps are replaced by iceStep, ela is optional when elaHistory is given, and the default erosion constant is 1e-4·50^(1−l)

### Added

- glaciers follow the LR04 glacial cycles: snowlineHistory scales the snowline by the benthic δ18O stack (Lisiecki and Raymo 2005, CC BY), and GlacialParams.elaHistory feeds it to a run
- only beds at the pressure-melting point slide and erode; thin ice high above the snowline stays frozen to its rock (snowlineTemperature, lapseRate, geothermalFlux)
- meltwater supercooling stops a glacier wearing its bed where the bed climbs out of an overdeepening too steeply (Alley et al. 2003)
- `LR04_STACK` (`@jgengine/core/landform/glacial/glacialClimate`): The LR04 benthic δ¹⁸O stack (Lisiecki & Raymo 2005), 0 to 800 ka. Also `Delta18ORecord`, `SnowlineHistory`, `SnowlineHistoryOptions`, `snowlineAt`, `snowlineHistory`.

### Changed

- ice shields its bed from rivers, soil creep and lakes, rockfall onto a glacier rides it to the snout, and till melts out over the ablation zone

### Fixed

- ice thickness is solved fully implicitly by Newton's method with an active set, so glaciers converge on real mountains instead of piling up 15 times too much ice
- first-order glaciers match each face's speed to the first-order solve, so a smooth steep bed carries a smooth ice surface (steps under 2 m, from 130–150 m)
