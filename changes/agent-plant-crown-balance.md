open-grown sugar maple and white pine crowns now match Ek 1974 widths (0.8–1.25×) at 20, 50 and 100 years, and stand-grown crowns sit inside the Tallo band

Root cause: crowns held too little leaf area for their spread, so the fit traded width for height, and stand neighbours could not stop a crown spreading into their space

Closes #2729

### Added

- carbon.lightHalfSaturation, a saturating light response (Thornley 1976), so a shaded crown keeps its leaves and an open one stops overbuilding
- growth.establishmentYears and the sapwoodAtBreastHeightM2 stat
- stand neighbours are periodic images in the light field, and space nearer a neighbour's stem gets no light (crown shyness, Putz et al. 1984)
- `BAAD_LEAF_TO_SAPWOOD` (`@jgengine/core/plants/validation/stemAllometry`): Leaf area per sapwood area at breast height of temperate and boreal trees taller than 5 m in the Biomass And Allometry Database (Falster et al. Also `FIA_STAND_DIAMETER`, `LeafToSapwoodBand`, `StandDiameterAtAge`.

### Changed

- Part of #2699

### Fixed

- open-grown sugar maple and white pine crowns now match Ek 1974 widths (0.8–1.25×) at 20, 50 and 100 years, and stand-grown crowns sit inside the Tallo band
- forest-grown trees reach FIA site-tree diameters on site index 65, and open-grown trees carry the BAAD leaf area per sapwood area
- evergreen foliage is renewed only after leaf.lifespanYears, and laterals the bud cap refuses grow as short shoots

