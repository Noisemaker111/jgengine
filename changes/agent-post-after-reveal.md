Post effects no longer hold the loading cover: under it only the beauty pass, exposure meter, tone map and grade link; AO, bloom, antialiasing, haze, contact shadows, depth of field and stylize link off the frame after the reveal and fade in over 0.3 s once ready. The load check now also reports frame times for the two seconds after the cover lifts.

Measured with `bun run shoot --load <game> --guard`, before and after built side by side and run in alternating pairs on a busy PC (7 rounds; median scene ready):

| game | before | after |
|---|---:|---:|
| harbor-heat | 7939 ms | 7085 ms |
| scrap-signal | 7766 ms | 6843 ms |
| drift-foundry | 9952 ms | 10187 ms (frame-rate bound after the reveal, noisy both ways) |

First 2 s after the reveal, final build (rounds 6-7):

| game | build | worst frame | median frame | frames over 33 ms |
|---|---|---:|---:|---:|
| harbor-heat | before | 122 / 79 ms | 23 / 17 ms | 4 / 2 |
| harbor-heat | after | 109 / 89 ms | 22 / 17 ms | 5 / 2 |
| scrap-signal | before | 32-41 ms | 17 ms | 0-2 |
| scrap-signal | after | 31-32 ms | 17 ms | 0 |
| drift-foundry | both | 235-530 ms | 46-60 ms | every frame |

Effects come on 0.9-1.7 s after the reveal. The load check now waits for that 2 s window before pressing Play, so the "playable" time moves later by design.

Prevention: PostProcessing tests (a chain starts with only the beauty, meter, output and grade on; the fade takes 16-18 frames at 60 fps and a 1 s hitch moves it only about a tenth; the beauty pass jitters only while TAA is on), shaderWarmup tests (`linkDrawsOffFrame` holds the chain's draws, links each distinct one, draws only target passes once after their link and never the canvas; `sceneRevealed` waits for the scene's warmup).

Bends: none.

### Changed

- `PostProcessing` (`@jgengine/core/postfx/PostProcessing.draw`) builds its effect passes switched off and turns them on after the scene's loading cover lifts and their programs have linked off the frame, fading them in over 0.3 s. A settings change that rebuilds the chain does the same. `immediate` draws every effect from the first frame (the shell passes it for posters).
- The beauty pass under temporal AA jitters only while the TAA pass is on.

### Added

- `linkDrawsOffFrame` and `sceneRevealed` (`@jgengine/core/render/shaderWarmup.draw`): link the programs a set of draws would run without drawing them, and wait for a scene's loading cover to lift.
- `bun run shoot --load` reports the worst frame in the two seconds after the cover lifts, and each run's frame count, worst, median and frames over 33 ms in that window.
