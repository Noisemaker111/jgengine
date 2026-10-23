### Fixed

- Terrain build no longer scans every road and path segment for every vertex. A baked path corridor, a draped road and a painted polyline region each answer "how far is this point?" from a precomputed segment grid, so Scrap Signal's world build drops from 16.6 s to 0.51 s on the same machine and its longest boot stall from 11.6–18.4 s to 1.2 s. Sampled heights and palettes are bit-identical to the previous full scan, and `withPathProfiles` still composes profiles in order.

### Performance

- `createTerrainPaletteSampler` (`@jgengine/core/world/terrain`) tests only the material regions whose painted core or blend ring covers a sample, so a world with hundreds of authored regions no longer pays for all of them at every vertex.
