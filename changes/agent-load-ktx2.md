Every game's textures now reach the GPU compressed when it is played locally, and roads link their shader once instead of two or three times.

### Changed

- Textures load as GPU-compressed KTX2 (Basis UASTC) when the server has a compressed twin. `bun run games:compress` encodes twins of every game's model and material textures into the shared asset store (`.asset-store/.ktx2/`). The step runs on its own, in the background at idle priority, when a game's dev server or the dev runner starts, and never runs in CI. A server without twins sends the original files, so nothing changes in CI or on a fresh clone.
- The Basis transcoder and the Draco decoder now ship with the game's own build instead of loading from a CDN. `configureModelLoaders()` with no paths uses the bundled copies; passing a folder path still works.
- Roads and junctions stay hidden until their scanned asphalt has loaded. Before, they linked a procedural program first and then relinked once the scan arrived. Shader warmup also re-applies the scene's shadow and wetness patches to a material swapped in after warmup was planned, so that material links once, already patched.
- Browser test fixtures understand `?url` imports, the way Vite does.

Measured on this RTX 3070 (/play runner, cold, best of 2):

| | without twins | with twins |
|---|---:|---:|
| scrap-signal scene ready | 9.5 s | 8.9 s |
| apex-nights scene ready | 6.2 s | 5.5 s |
| scrap-signal 2048² uploads | 16 decoded images on the main thread | 15 compressed uploads, 11 ms in total |

| harbor-heat roads | before | after |
|---|---:|---:|
| programs linked | 120–122 | 113 |
| scene ready | 11.3–16 s | 9.4–10.1 s |

The load guard baselines were tightened wherever a game got faster; none were loosened.

Handed to the world builder: drift-foundry's ground, and models drawn both instanced and plain (the duplicate programs).
