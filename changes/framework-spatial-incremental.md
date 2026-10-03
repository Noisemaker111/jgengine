### Added

- Bare spatial APIs can opt into notified incremental indexing with `incremental: true` and `updateEntity(id, candidatePresent?)`. An explicit presence flag supports candidate subsets independently of the position resolver. Entity stores offer a committed-ID/membership hook before existing subscribers.

### Changed

- Runtime entity radius/arc queries update individual grid entries after pose and membership writes instead of rebuilding or enumerating the whole population on every query. Cold invalidation and large membership bursts rebuild lazily; save/replication hydration still derives the index from authoritative entities. Immediate subscriber queries observe committed membership and poses.

### Migrate

- Bare APIs keep their existing default discovery behavior. Opt into incremental mode only if every membership/position write reports its ID or invalidates. Subsets with a broader position resolver must report explicit candidate presence; omitted presence asserts membership when the position resolves. Unresolved candidates retain a fallback proportional to their count. Direct runtime entity mutation requires `invalidateSpatial()`.
