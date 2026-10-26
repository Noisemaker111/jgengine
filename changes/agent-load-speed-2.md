Big scenes reach "scene ready" sooner: drift-foundry now finishes loading (it never settled before), harbor-heat drops from about 29 s to 14-16 s, and the load guard has a baseline for all 17 games.

### Changed

- Loading cover progress no longer re-renders the scene. The warmup reported progress through React state in the component that renders the canvas, so every report re-rendered the whole 3D tree (12,000+ components in drift-foundry, several times a second) and starved the warmup it was reporting on. Progress now goes through a small store the cover subscribes to.
- Placed objects measure their collision mesh once per catalog kind and model, not once per placed instance (drift-foundry walked about 2,000 clones of the same models on load). Batched static props measure each source once and keep their variant levels across membership changes instead of re-measuring every render (harbor-heat).
- Shader warmup: instanced, batched and skinned meshes are judged in or out of view by the same bounds the renderer culls with, so the first view's programs go first; shadow casters outside the view get their depth programs with the first view and their lit programs after.
- Ground that is already wet when it loads is patched before the warmup compiles it, instead of compiling dry and then again wet (drift-foundry compiled its 100 KB terrain shader twice, about 3 s each).
- `bun run shoot --load --guard` and `--save-baseline` stop at scene ready instead of pressing Play and waiting for playable. One game's guard run, build included, takes about 40 s; all 17 games measure in three batches of 1-2.5 minutes with `--no-build`.

Cold loads on this RTX 3070 (/play runner, fresh profile, NVIDIA DXCache cleared before each batch; ms, single runs on a shared machine, so about ±20% noise):

| game | scene ready before | after | worst freeze before | after |
|---|---:|---:|---:|---:|
| apex-nights | 12343 | 9960 | 928 | 904 |
| beacon-bastion | 11513 | 9625 | 739 | 760 |
| briarcrown | 8801 | 8111 | 531 | 525 |
| brightway-park | 13879 | 14648 | 543 | 540 |
| deepward | 4467 | 4477 | 552 | 561 |
| drift-foundry | never (timed out at 86 s) | 26700 | 2769 | 2182 |
| ember-command | 10283 | 10158 | 705 | 761 |
| fernwild | 11172 | 11505 | 1555 | 1340 |
| harbor-heat | 29142 | 16286 | 1738 | 778 |
| hold-the-line | 10362 | 10130 | 1558 | 1473 |
| odd-orbit | 11590 | 14110 | 748 | 675 |
| orbit-watch | 11224 | 10196 | 864 | 769 |
| outpost-zero | 10124 | 10373 | 787 | 645 |
| red-frontier | 10898 | 11194 | 729 | 728 |
| saltwick | 17563 | 10223 | 816 | 526 |
| scrap-signal | 28709 | 23176 | 871 | 1016 |
| the-sunken-crown | 12275 | 9201 | 1952 | 1782 |

Scene ready is still over 5 s for every game but deepward. What is left is the GPU compile itself: ANGLE on Direct3D 11 compiles 50-120 programs per game cold, about 0.3-0.8 s each with several in flight, and a procedural terrain program (about 100 KB of HLSL) takes about 3 s on its own. drift-foundry also waits for its terrain to finish building, about 14 s into the load.
