bun run perf fps-gap measures every game at the frame gate's conditions and prints each against 360 fps (2.78 ms) with its costs grouped into ranked engine work items; a report, not a gate

Engine seam: packages/core/src/devtools/agentBridge.draw.ts, packages/core/src/postfx/PostProcessing.draw.tsx, packages/jgengine/src/desktop.ts

### Added

- bun run perf fps-gap measures every game at the frame gate's conditions and prints each against 360 fps (2.78 ms) with its costs grouped into ranked engine work items; a report, not a gate
- a desktop build runs without the display's vsync with <Game>.exe --uncapped on Windows (WebView2); without the flag it keeps vsync
- bun run perf desktop --launch <app.exe> [--uncapped] measures a production desktop build in the game's scene at the gate's conditions
- the capture_run agent-bridge verb runs a game's capture.play or a capture state in a shipped build, skipping dev-only helpers on request
- `CAPTURE_COMMAND_INPUT` (`@jgengine/core/devtools/agentBridge.draw`): The input a capture command named by a bare string runs with: a neutral look, so a command that reads an aim or heading gets one.

### Fixed

- a production build's frame breakdown names its post passes instead of their minified class names
- perf play, perf gate and jgengine desktop link the game's asset packs first, so a fresh checkout no longer measures or ships placeholder boxes
- jgengine desktop --diagnostics passes --sourcemap through a game's own build script, and names the app after defineGame's own name
