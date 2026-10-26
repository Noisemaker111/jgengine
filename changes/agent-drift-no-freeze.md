Driving in Drift Foundry no longer freezes for a quarter to half a second every few seconds: a part bolted onto the car mid-race, or anything else that turns up after the scene is shown, now appears once its shader is ready instead of stopping the frame while it compiles.

Drift Foundry, driving for about 24 s from the race start at 1280x720, uncapped, three interleaved rounds each (before = the build without this change):

| measure | before | after |
|---|---:|---:|
| worst frame | 459, 635, 478 ms | 103, 120, 122 ms |
| freezes over 200 ms, per minute | 10.0, 4.5, 10.1 | 0, 0, 0 |
| frames over 100 ms, per minute | 27.3, 29.5, 17.6 | 5.2, 19.3, 10.5 |
| median frame | 12.8, 13.8, 12.8 ms | 13.2, 14.1, 13.1 ms |

Every freeze was a shader compile on the frame that first drew something new: the salvage upgrades (engine, hood plate, fan blades, rims, plow) the car picks up as it drives, each with its own materials. They lined up with the reflection refresh only by timing. The frames still over 100 ms come in a burst near the end of the drive while the car sits stuck against a barrier, are the same before and after, and have no long script task or compile behind them.

Prevention: `shaderWarmup.draw.test.ts` fails when a drawable that arrives unlinked is drawn before its program is ready, when its link is started twice, or when it stays hidden past the stall limit; `reflectionProbe.draw.test.ts` fails when the reflecting copy a capture links with differs from what the material will draw with, or outlives the material.

Bends: none.

### Changed

- After the reveal, each draw of the scene leaves out any drawable whose shader is not linked yet, starts its link off the frame, and draws it on the first frame it is ready (`deferUnlinkedDraws` in `@jgengine/core/render/shaderWarmup.draw`, installed by the scene warmup gate). A link that never reports completion stops hiding its drawable after 30 s.
- The reflection probe links, in the background, the programs a capture's environment map will need for every material reflecting for the first time, then hands the map over; the first capture included. `compileObjects` takes the material each drawable is about to draw with.
