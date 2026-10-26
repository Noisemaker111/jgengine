Opening a game on jgengine.com left its menu dead for 15–30 s on a cold cache; now the menu answers clicks in under 1 s for 14 of 17 games while the scene prepares behind it.

Root cause: the shader warmup let the frame loop draw under the cover, and three linked every program synchronously at its first draw (PMREM bakes, post passes, shadow depth programs, CSM-patched and probe-resized lit programs were never warmed). On top of that, terrain meshes (and grass, before the streamed grass system) were built in one synchronous pass inside render, and every game's code shipped in one bundle.

### Added

- `bun run shoot --load <game|all>` measures cold-cache load times per game on a production build of the site, in a fresh Chrome profile on the real GPU: first paint, menu shown, worst menu stall, scene ready, playable, long tasks and KB. `--compare <json>` prints a before/after table, and `--trace` saves a Chrome trace. It is local only and never runs in CI.

### Changed

- Shader warmup (`packages/shell/src/render/shaderWarmup.ts`, `SceneWarmupGate.tsx`):
  - It holds only the frame loop's own draws.
  - It links what those held draws need (post-processing quads and override passes) and the shadow pass's depth programs. It also links the render-target variants for a reflection probe.
  - It links in batches with a GPU fence between them, using `KHR_parallel_shader_compile` readiness. It reads each program's uniforms once the program is ready, then draws each program once per vertex layout while still covered.
  - It never touches a program that is still building. One stall guard now covers a slow program (up to 30 s).
  - The cover bar shows real link progress.
- The environment and world-probe PMREM bakes link their programs ahead of time, off the frame, at the probe's size. A probe taking over at a different size no longer relinks every lit program.
- Cascaded shadows patch swapped materials before the warmup links them.
- Carved terrain meshes build in slices after mount (`useSlicedValue`, `@jgengine/core/run/slicedWork`), and count as scene loading. Scanned terrain maps count as loading until they answer, so their textured program is linked under the cover.
- The /play runner loads each game's code on demand.

### Load times (`bun run shoot --load all`, cold profile, RTX 3070, one run each)

| game | worst menu stall, before → after (ms) | scene ready, before → after (ms) |
|---|---:|---:|
| apex-nights | 15772 → 766 | 33926 → 13290 |
| beacon-bastion | 26865 → 709 | 33395 → 23257 |
| briarcrown | 25072 → 734 | 37717 → 23545 |
| brightway-park | 29063 → 564 | - → 22168 |
| deepward | 3012 → 683 | 11614 → 6381 |
| drift-foundry | 15105 → 4058 | 48325 → - |
| ember-command | 23891 → 843 | 30415 → 25080 |
| fernwild | 30046 → 1614 | 42530 → 28572 |
| harbor-heat | 15463 → 2286 | - → 37479 |
| hold-the-line | 7183 → 931 | 21502 → 11833 |
| odd-orbit | 22766 → 893 | 58756 → 24926 |
| orbit-watch | 7481 → 720 | 18861 → 11500 |
| outpost-zero | 8842 → 776 | 20065 → 10615 |
| red-frontier | 8335 → 884 | 18819 → 11713 |
| saltwick | 23683 → 639 | 36378 → 20877 |
| scrap-signal | menu not found (13197 longest task) → 815 | 34231 → 33846 |
| the-sunken-crown | 23627 → 630 | 36931 → 24092 |

Menus are responsive throughout; how long the cover stays up depends on the driver's shader compile time.

### Verification

- `bun run verify:fast`: pass (36/36)
- `bun test packages/shell`: 1465 pass (before the rebase onto the streamed grass system)
- `bun run gen`: ok
- `bun run shoot --load all --compare .scratch/load/before.json`: table above
- Seen in the browser on the local production build: Hold The Line's menu moves to Controls at about 2 s while "Preparing scene" is still up.

![hold-the-line](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/play-load-speed/hold-the-line.png)
![scrap-signal](https://raw.githubusercontent.com/Noisemaker111/jgengine/pr-shots/pr-shots/agent/play-load-speed/scrap-signal.png)

### Known gaps

- drift-foundry (4 s), harbor-heat (2.3 s) and fernwild (1.6 s) still have one long task. In drift-foundry it is a React commit of its scene models and colliders.
- The cover itself stays up 10–37 s on a cold driver cache, because large programs take that long to compile on ANGLE/D3D11. So the progress bar is not under 5 s.
- `presentationIdentity.test.tsx` now removes the stand-in `Image` it installs. It used to hang `sceneCaptureRequest`'s decode test whenever the two ran in one process.
