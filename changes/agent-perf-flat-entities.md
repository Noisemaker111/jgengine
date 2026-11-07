createSpatialIndex keys cells by number and ids by integer handle, so moving ids and querying allocate nothing.

### Added

- `bun run perf crowd` times one crowd tick (neighbours within 1.5 m, separation, speed clamp, move, bounds; 0.5 agents/m²) written against createEntityStore + createSpatialIndex the way game code is, beside the same step over Float32Array columns and a counting-sort grid. Engine and flat ticks alternate so machine load hits both alike.

### Changed

- Cells live in an open-addressing table with their coordinates inline and their members in one pooled Int32Array; a query skips ids it already returned with a typed-array stamp instead of a Map. Cells keep creation order and each cell keeps its ids' order, so snapshot/restore still replay query results exactly. Public API unchanged.
- Measured in one process, old and new interleaved tick by tick (Bun 1.4.4, shared 24-core PC). Index alone, one querySphere + one update per id: 1k 9.8 → 1.4 ms (7.1x), 10k 207 → 24 ms (8.6x), 100k 4,199 → 881 ms (4.8x). Whole crowd tick through today's store: 1k 13.5 → 4.7 ms (2.9x), 10k 403 → 186 ms (2.2x), 100k 8,477 → 4,442 ms (1.9x); flat-array reference 0.19 / 2.0 / 38 ms.
- harbor-heat is unchanged, and was expected to be: the spatial index was ~1% of its frame and rendering dominates. Paired runs in both orders: old index 20.3 / 25.3 ms average frame, new index 26.6 ms (and one 53.7 ms run under machine load whose engine JS was not slower); the index's own profile share fell from 0.8-0.85% to 0.17-0.5%. This layout is the foundation for large crowds, big multiplayer worlds and the Rust multi-core kernel in #2999; the remaining crowd gap is string-keyed store lookups, addressed by the store fast path in a follow-up PR.
- Verified on a boat.dev Linux machine from a clean clone of head f602128fd: preflight (install, gen, type-checks, gates) and verify:fast (1001 test files, 31 type-checks, 6 gates, harbor-heat boot) passed.
- Regenerated the jgengine-world api.md for the spatial index's updated docs

### Fixed

- createSpatialIndex keys cells by number and ids by integer handle, so moving ids and querying allocate nothing.
