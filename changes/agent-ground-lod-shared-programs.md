A big ground (drift-foundry's 438k-vertex yard) now shows as level-of-detail tiles costing about 7k vertices up front instead of meshing the whole field, and a prop left alone in its cell draws through its model's instanced batch, so its materials link one program instead of two.

### Changed

- A ground over 66k vertices splits into 128-cell tiles, each a `THREE.LOD` at strides 1/2/4/8/16. Scene load builds only the coarsest level of every tile plus what the camera needs nearby; finer levels build in the background as the camera reaches them. Each level drops a skirt below its edges, so neighbouring tiles at different detail show no crack. Normals come from the sampled heights, so a tile edge lights the same from both sides.
- A pulled terrain scan that may be missing no longer meshes the ground twice (once for the procedural stand-in, again when its maps load): the same mesh swaps material.
- A compatible prop alone in its 128 m cell joins the nearest batch of its model, and a model with no cell batch gathers its lone props into one. Drawn as a plain mesh it linked a second, non-instanced program for every material the batched copies already had (harbor-heat start: 112 programs, now 107).

Measured on this RTX 3070 (/play runner, cold, shared machine):

| | before | after |
|---|---:|---:|
| drift-foundry ground vertices built for scene ready | 438k (twice with a pulled scan) | ~7k + near tiles |
| drift-foundry height samples on the main thread | 1.7 s | 1.0 s |
| drift-foundry scene ready | 9.3–10.9 s | 9.3–10.0 s |
| harbor-heat programs at start | 112 | 107 |

Ground meshing no longer appears in drift-foundry's long tasks. Its scene ready is now held by shader warmup and model setup, plus the water depth plane and road ribbons sampling the yard's height field (about 1 s of early hitches).

### Bends

- Remaining instanced/plain pairs in harbor-heat are vehicles and characters: far ones draw through the baked crowd (its own shader), near ones on their full rig. That is two techniques, not one material compiled twice, so they stay.
- Making every lone prop a batch of one was tried and dropped: drift-foundry's scene ready went from about 10 s to 19–28 s (per-batch machinery on hundreds of one-prop batches).
