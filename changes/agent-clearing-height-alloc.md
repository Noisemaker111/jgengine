grass and terrain clearing math stops calling Math.hypot per zone and per vertex, so streaming grass in ember-command allocates about a third less

Root cause: flattenFieldAround's sampleHeight and the shared clearance masks (zoneInfluence, distanceToSegment) measured every zone with Math.hypot, which allocates on every call in V8; grass bake runs them for every node and vertex against every zone. They now compare squared distances first and take Math.sqrt of their own sums. Same heights and coverage; the terrain, grass, scatter and environment tests pass unchanged.

### Fixed

- grass and terrain clearing math stops calling Math.hypot per zone and per vertex, so streaming grass in ember-command allocates about a third less
