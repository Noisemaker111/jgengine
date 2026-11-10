shadow checks run only on frames a pass can serve from the cache, churned and always-dynamic casters skip dead snapshot work, far scatter bands stop casting shadows past 250m, and Fernwild adopts hlod with tighter mesh LODs

Refs #3014 #3015

Engine seam: packages/core/src/instancing/StaticObjectModels.draw.tsx, packages/core/src/instancing/staticDrawPool.draw.ts, packages/core/src/lighting/shadowCache.draw.ts, packages/core/src/scatter/InstancedScatter.draw.tsx, packages/core/src/scatter/ScatterImpostorField.draw.tsx

### Changed

- # one-pr-split: first PR landed before the goal was met

### Fixed

- shadow checks run only on frames a pass can serve from the cache, churned and always-dynamic casters skip dead snapshot work, far scatter bands stop casting shadows past 250m, and Fernwild adopts hlod with tighter mesh LODs
