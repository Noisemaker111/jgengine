### Fixed

- `shoot` fails instead of writing a PNG when the whole frame is one flat colour, and when a scene is still behind its loading cover. Both used to write a plausible screenshot that read as evidence of a rendered frame.
- The editor's play-mode pixel test waits for the warmup cover to clear before screenshotting. It shot the cover, so it read `0.9988` one-colour locally and passed in CI where the race fell the other way.
- `shoot` prints the WebGL2 renderer it draws with and fails the capture outright when the launched browser has none.

Root cause: capture readiness was trusted to mean "the scene has rendered", but a loading cover and a canvas that never committed both photograph as a flat frame, and nothing measured the frame after the fact. Headless Chrome on this PC was never the problem: it renders with the GPU (`ANGLE (NVIDIA GeForce RTX 3070, D3D11)`) and with SwiftShader when asked.

Before: `bun run shoot --url <flat canvas page>` exited 0 and wrote a one-colour PNG, and `packages/editor/src/CreatorApp.test.ts` failed locally at `dominantColorShare 0.9988`.
After: the same shoot exits 1 with `the whole frame is one flat color (100.0%) - no scene reached the capture - nothing was written`, and the editor test passes in 12s with sky and ground in the PNG.

Cost: forcing SwiftShader on the same game shot costs 2.4x the capture (16.0s vs 6.7s warm, beacon-bastion play at half size), so the launch keeps the native GPU. The two checks add about 10ms to a shot.

Verification:
- `bun test scripts/shot-metrics.test.ts` - pass
- `bun test packages/editor/src/CreatorApp.test.ts` - pass
- `bun run shoot beacon-bastion --mode play --size half` - exit 0, scene renders
- `bun run shoot --url <flat canvas page>` - exit 1, no PNG written
- `bun run verify:fast` - pass

The CI reliability fix this lane also carried (a browser setup hook shorter than Playwright's launch default) is #2335, so either change can be reverted without the other.
