the WebGPU backend draws every game as WebGL does and is now about level with it on the same frozen frame (up to 3.2x slower on beta). WebGL stays the default because WebGPU wins on no game on every run

Root cause: the WebGL emulation allocated and built strings on every draw, uniform call and pass, and re-staged whole uniform blocks; three shader shapes (a one-element sampler array, isinf/isnan, a multisampled depth blit) silently dropped draws, which made two games look faster on WebGPU than they were

Refs #3066

### Changed

- Before/after (WebGPU p50 ms on the same frozen moment, beta -> branch, run back to back): Fernwild 35.3 -> 13.1, Scrap Signal 17.1 -> 12-15, Harbor Heat 14.8 -> 10.3, Ember Command 11.3 -> 7.6, Odd Orbit 7.6 -> 3.7, Beacon Bastion 5.5 -> 4.0. WebGPU/WebGL went from 1.2-3.2x to 0.8-1.2x. Drift Foundry and Deepward were fast on beta only because they drew less (a missing program, a black frame). Full table and per-run ratios: https://github.com/Noisemaker111/jgengine/issues/3066#issuecomment-6722682320
- Unequal coverage: there is no paired perf desktop --all run on the final head, because C: had 1-4 GB free and a build set needs 2.6 GB plus the 2 GB capture floor. The last desktop run is at 9c03ac0fe. Repeats per game range from 2 to 5.

### Fixed

- the WebGPU backend draws every game as WebGL does and is now about level with it on the same frozen frame (up to 3.2x slower on beta). WebGL stays the default because WebGPU wins on no game on every run
