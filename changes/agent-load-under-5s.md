Faster cold scene load: dense props build their collision index about 4x faster, an environment bake no longer freezes the main thread waiting on a filter shader another bake is still linking, and the loading cover lifts once the last new shader is 250 ms old instead of waiting 250 ms after the final settle. The load check now provisions the packs it measures, so a fresh worktree never times a game drawn without its materials.

### Changed

- `prepareCollisionMeshSource` and `prepareCollisionMesh` split BVH nodes with a median select instead of a full sort (same tree contents, 4x faster on a 100k-triangle prop).
- The scene warmup reveals one empty round after the last link instead of three; `linkAhead` also waits for programs the compile reused while another caller was still linking them.

| game | scene ready before (ms) | after (ms) |
|---|---:|---:|
| harbor-heat | 8787 | 7378 |
| drift-foundry | 10029 | 8422 |
| scrap-signal | 8895 | 7233 |

Still above 5 s: what is left is the GPU linking 60-100 distinct shader variants one after another on a cold Direct3D cache (about 25-35 ms each, ~3 s per game).
