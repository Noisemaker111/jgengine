the subcommand test still expected perf gate's old 1500 s guard after the gate's guard became 5400 s

### Added

- perf names the phase a game's measurement is in (load, warmup, frame window, draw-timed GPU window, profile), so a session killed at its deadline says which one hung
- `GpuTiming` (`@jgengine/core/devtools/frameBreakdown`): How the breakdown times the GPU.

### Fixed

- the subcommand test still expected perf gate's old 1500 s guard after the gate's guard became 5400 s
- the sky dome draws after the opaque scene, pinned to the far plane, so its depth test shades only the open sky instead of every pixel the scene then paints over (0.12-0.18 ms of GPU a frame in Harbor Heat and Fernwild, about 0.03 ms after), and a large sky radius no longer depth-clips to black
- draw-timed GPU work brackets only the context's draw, clear and blit calls, because a timer opened before three binds uniforms and textures also counts the GPU idle during that setup (Harbor Heat's scene pass read 6.6 ms that way against about 2 ms of draws)
- baked crowds (cars, planes, buses, people) and scatter proxies keep their index buffers instead of flattening every part to loose triangles, so each shared vertex is shaded once rather than once per triangle corner: the same triangles in the same order, so the same pixels, with about a third of the vertex shading in every pass that draws them (Harbor Heat's 37k-triangle car batch drew 783k triangles a frame at three vertex runs each)
- perf gate and fps-gap give each game's browser session a deadline that covers the capture's two readiness windows, its warmup and its windows, instead of a fixed 300 s that killed a busy PC's page right after the capture granted it more time; their run guards back that up at 5400 s
- the frame breakdown can time every draw and clear on its own (gpuTiming "draws"), because a pass timer also counts the GPU idle while the CPU submits; perf fps-gap now reports that GPU work per game and pass beside the old span (Harbor Heat's scene pass: 2.75 ms of work in a 7.7 ms span)
