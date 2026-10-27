Faster frames in every game: half-resolution ambient occlusion, a matrix pass that skips what stood still, and a cheaper per-frame scene walk

### Changed

- Faster frames in every game: half-resolution ambient occlusion, a matrix pass that skips what stood still, and a cheaper per-frame scene walk
- Ambient occlusion and its denoise run on a quarter of the pixels; at 1080p that cut its GPU time from about 2-3.8 ms to 0.6-1.6 ms in every game that uses it, with no visible change in a side-by-side shot.
- The scene's matrix pass rebuilds only nodes whose position, rotation, scale, parent or world matrix changed; the shader warmup and other traverseVisible callers use a stack walk (visitVisible), 1.4 ms -> 0.12 ms on fernwild.
- Dev telemetry reads the GPU name once instead of every second; bun run perf names the engine or game function behind each hot three.js function, and a compile hitch names the draw that waited.
- bun run perf takes several games in one browser and ends with a table per game; a clean-tree run is cached per commit so --compare HEAD measures only the after side; the process exits once results are written.
