bun run check fails on a new large copy, unused code or a wrong-way import, and says where the thing lives (lint, unused and copies; docs/architecture.md)

Engine seam: packages/assets/src/modelLibraryAuthored.ts, packages/convex/src/server.ts, packages/core/src/city/CityRenderer.draw.tsx, packages/core/src/grass/GrassCover.draw.tsx, packages/core/src/instancing/staticObjectBatches.draw.ts, packages/core/src/leaderboard/leaderboardRank.ts, packages/core/src/lighting/shadowCache.draw.ts, packages/core/src/render/textureComparer.draw.ts and 17 more

### Changed

- bun run check fails on a new large copy, unused code or a wrong-way import, and says where the thing lives (lint, unused and copies; docs/architecture.md)
- Fernwild's capture probe is one file per feature under src/game/probe

### Removed

- bun run check react-free; the lint rule and the unused-dependency check replace it
