Drift Foundry draws faster and no longer flashes half its screen dark every eighth frame, and the load check now times Scrap Signal's world instead of the empty canvas under its menu.

Drift Foundry, two paired rounds on the same machine state (before = beta without this change):

| measure | before | after |
|---|---:|---:|
| median frame, vsync capped | 50 ms, 50 ms | 33.4 ms, 33.4 ms |
| median frame, uncapped | 55.4 ms, 45.7 ms | 35.3 ms, 38.1 ms |
| worst frame, uncapped | 143.5 ms, 61.8 ms | 43 ms, 48.7 ms |
| frames with one half dark, of 120 | 15, 15 | 0, 0 |
| load check: scene ready | 17.0–40.5 s | 7.1 s, 8.1 s |
| load check: playable | never | 9.3 s, 9.7 s |

Scrap Signal's load check now reads 165–178 colours with a 17 ms median once its menu lifts, where it read 1 colour (the covered canvas) before.

Prevention: `surfaceBumpNormal.draw.test.ts` runs the shared bump chunk on a real GPU with a degenerate pixel frame and fails on the old chunk (all 256 pixels NaN); Drift Foundry's `scenery.test.ts` fails when its track props stop being scenery; `load-check.test.ts` covers the covered-reveal summary.

Bends: none.

### Changed

- The shared screen-space bump (`SURFACE_BUMP_NORMAL_GLSL`, `@jgengine/core/terrain/terrainSurfaceShader.draw`) keeps the incoming normal when the pixel frame is degenerate. A wet puddle's flat normal seen edge-on made the bump vector zero, normalizing it gave one NaN pixel, and bloom's blur spread that pixel over half the frame whenever TAA's jitter landed on it. Model surface detail now uses the same chunk instead of its own copy.
- Drift Foundry marks its five newer tracks' standing props (edge posts, lamps, clutter, set-pieces) as `scenery`, so they draw through shared instanced batches instead of about 2,000 separate props whose scene graph three walked every frame.
- `bun run shoot --load`: when a game's own full-screen menu covers the canvas at the reveal (Scrap Signal's broadcast menu stops the world drawing under it), the two-second frame window and the blank-scene read wait until the menu lifts after the Play press, and the run line says so.
