Games reach "scene ready" about twice as fast: 11 of 17 now land at 4-6 s cold (they were 10-19 s), the menu no longer freezes for over a second on fernwild, hold-the-line and the-sunken-crown, and pressing Play no longer freezes saltwick for 8 s or scrap-signal for 1.7 s.

### Changed

- Terrain and road shaders compile about 5x faster on Direct3D: their noise reads a small shared lattice texture instead of an integer hash the HLSL compiler inlined hundreds of times.
- The ground mesh builds from a padded height grid sampled once per vertex (no repeated route projections for slopes), and the terrain mounts a shared stand-in until its geometry is ready, so the warmup no longer waits on it.
- Shader warmup: draws are grouped by the program three actually linked rather than by material, texture uploads happen under the cover for the first view (and only the cut-out maps of off-screen shadow casters), the rest upload one per frame afterwards, and a post-processing chain the covered frame loop never ran is linked under the cover too (`warmupDraws`).
- Image textures (surface scans, authored material maps, building surfaces, terrain detail maps) decode off the main thread through one `ImageTextureLoader`, so their upload no longer decodes a large JPEG inside `texImage2D`.
- Grass fills its view over a few frames (8 ms slices, nearest first) instead of baking the whole field in one frame.
- A cycling sky keeps its moon light mounted (dark by day). Mounting it as the moon crossed the horizon changed every lit program, so the whole scene relinked, an 8 s freeze in saltwick as play starts at dawn.
- Thousands of idle `useFrame` subscriptions (foot IK, glance, animation, paint) now subscribe only while they have work, through `useFrameWhile`.
- The surface-scan maps hold the warmup until they load, so it links the scanned road programs rather than the procedural ones they replace.

Cold loads on this RTX 3070 (/play runner, fresh profile, single runs on a shared machine, so about ±20% noise; ms):

| game | scene ready, first measured | before this change | after | worst click before | after |
|---|---:|---:|---:|---:|---:|
| apex-nights | 12343 | 16005 | 6153 | 1196 | 364 |
| beacon-bastion | 11513 | 19153 | 5288 | 1125 | 780 |
| briarcrown | 8801 | 12740 | 4817 | 973 | 529 |
| brightway-park | 13879 | 18148 | 5470 | 569 | 490 |
| deepward | 4467 | 5599 | 4180 | 627 | 536 |
| drift-foundry | never | 31243 | 9652 | 1945 | 815 |
| ember-command | 10283 | 15926 | 5214 | 849 | 555 |
| fernwild | 11172 | 9653 | 5818 | 1372 | 434 |
| harbor-heat | 29142 | 17006 | 9469 | 798 | 1072 |
| hold-the-line | 10362 | 13050 | 5743 | 1886 | 416 |
| odd-orbit | 11590 | 15429 | 6645 | 907 | 589 |
| orbit-watch | 11224 | 11007 | 4411 | 726 | 490 |
| outpost-zero | 10124 | 9598 | 4800 | 616 | 459 |
| red-frontier | 10898 | 10842 | 4149 | 926 | 477 |
| saltwick | 17563 | 10425 | 5531 | 820 | 362 |
| scrap-signal | 28709 | 21497 | 11928 | 1544 | 763 |
| the-sunken-crown | 12275 | 11295 | 6344 | 2019 | 460 |

Still over 6 s: drift-foundry (its ground is 438k vertices and the first view draws about 3,400 objects), scrap-signal (about 165 textures at 2048x2048 to upload, roughly 11 ms each; compressed or smaller textures are the fix) and harbor-heat (121 shader programs). After Play, briarcrown and red-frontier still link a few new materials on the first frame (about 1-2 s).
