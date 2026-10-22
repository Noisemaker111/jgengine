### Added

- Load-time shader warmup for 3D presentations. `createShaderWarmup` (`@jgengine/shell/render/shaderWarmup`) compiles the mounted scene through `WebGLRenderer.compileAsync` in rounds, one per burst of streamed models, and reports a phase, round and program count a loading screen can render. It is bounded: a round is raced against its budget, so a driver that never reports a finished program cannot hold the first frame.
- `SceneWarmupCover` (`@jgengine/shell/render/SceneWarmupGate`) is the opaque cover the shell puts over the canvas until that warmup finishes. It carries `data-shell-code-loading`, so capture and drive already wait for it, and it clears itself on a failed compile. Game UI and menus mount above it and stay usable.
