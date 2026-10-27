Frame breakdown and perf command: where every frame goes

### Added

- `HITCH_MS` (`@jgengine/core/devtools/frameBreakdown`): Where each frame goes: the record of one frame (CPU per system, GPU per render pass, draws, shader compiles, uploads, heap) and the summary of a window of them (percentiles, the costliest systems, passes, objects and materials, and every hitch with what caused it). Also `DrawCost`, `FrameBreakdownRecord`, `FrameBreakdownSummary`, `Hitch`, `NamedCost`, `Spread`.
- `measureComposerPasses` (`@jgengine/core/devtools/frameBreakdown.draw`): Time each post pass of a composer by name, CPU and GPU. Also `BreakdownRenderer`, `BreakdownStore`, `FrameBreakdown`.
- `LastFrameSample` (`@jgengine/core/devtools/types`): The last frame `devtools.frame.record` saw: its sim milliseconds and named phases.

### Changed

- Frame breakdown and perf command: where every frame goes
- Dev builds keep a per-frame breakdown (window.__jgFrameBreakdown, perf panel): CPU self time per engine and game system and per useFrame callback by file:line, GPU ms per pass (shadow, main, each post effect) via timer queries, draws, triangles, programs, uploads, top objects and materials, and hitches over 33 ms with their cause (compile, upload, gc, system, gpu).
- bun run perf <game> now defaults to 1080p, the uncapped clock and a walk path, writes .scratch/perf/<game>.json, prints a short text summary, and --compare before.json prints a before/after diff. The jgengine-verify skill has a 5-minute guide.
