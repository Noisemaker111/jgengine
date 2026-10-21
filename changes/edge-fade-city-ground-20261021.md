### Added

- `buildGroundCoverageMask`, `createGroundEdgeFade` and `applyGroundEdgeFade` (`@jgengine/shell/terrain`) fade any ground material out at the outer edge of a merged mesh footprint, leaving seams between layers inside it crisp.

### Changed

- City studio ground (roads, junctions, block land, sidewalks, medians, drives, parks, crops, curbs, markings) now fades into the terrain where the town's ground ends instead of stopping at a hard edge. `meta.edgeFade: false` on the city volume keeps the old hard edge.
