Pressing Play no longer freezes briarcrown (2.6 s), red-frontier (3.5 s), outpost-zero, saltwick, fernwild or orbit-watch, and scrap-signal sends 16 large textures to the GPU instead of 165.

### Changed

- Models that point at the same texture file share one image: each model file used to decode and upload its own copy, so a kit of forty wall pieces on one trim sheet uploaded that sheet forty times (scrap-signal: 165 uploads of 23 images, about 2.4 s of main thread, now 16 uploads, about 0.16 s).
- Lifting a menu that covers the canvas (pressing Play) compiles what the scene gained while covered before the frame loop draws again.
- For a few seconds after the reveal or a lifted cover, a frame that would link a new program mid-draw (a level the Play press spawns from the game loop) is skipped instead: the canvas keeps its last image while the warmup links the new content off the frame, and the loading cover comes back only when that takes over 0.4 s.
- Ground ribbons and see-through double-sided model materials (window glass, leaf cards) draw in one pass, which drops their second back-face program and draw.

Measured on this RTX 3070 (/play runner, cold, busy shared machine):

| | before | after |
|---|---:|---:|
| scrap-signal 2048² texture uploads | 165 (2.4 s main thread) | 16 (0.16 s) |
| scrap-signal scene ready | 12.0 s | 9.0 s |
| briarcrown longest freeze after Play | 2.6 s | none over 100 ms (about 0.6 s "Preparing scene" cover) |
| red-frontier longest freeze after Play | 3.5 s | none over 100 ms |
| outpost-zero / saltwick / fernwild / orbit-watch after Play | 0.85 / 0.98 / 0.59 / 0.40 s | none over 100 ms |
| programs (saltwick / briarcrown / harbor-heat) | 89 / 83 / 127 | 82 / 78 / 123 |
