closing a game and opening it again in the same page works; it used to stop with "Rune supports one native surface per page"

Engine seam: packages/core/src/audio/audioProbe.view.ts, packages/core/src/devtools/DevtoolsOverlay.draw.tsx, packages/core/src/devtools/DevtoolsRuntime.draw.tsx, packages/core/src/devtools/FrameTelemetry.draw.tsx, packages/core/src/devtools/PerfPanel.view.tsx, packages/core/src/devtools/agentBridge.draw.ts, packages/core/src/devtools/frameBreakdown.draw.ts, packages/core/src/devtools/frameBreakdown.ts and 35 more

### Migrate

- window.__jgengineAgent, __jgengineAudio, __jgProbe, __jgengineRun, __jgFrameBreakdown, __jgNativeUi, __JG.report and the other __jg* globals are window.__jg.agent, .audio, .probe, .run, .frames, .nativeUi, .report; a capture host sets window.__jg.captureHold
- attachPlaytestProbe(read) takes no host; installRenderCounter writes scope.__jg.renders; CAPTURE_HOLD_KEY is gone

### Added

- window.__jg, one object holding everything a running game publishes for agents, captures and devtools (agent, audio, probe, run, frames, nativeUi, report and the rest); it goes away when the game closes
- the landing gate opens, closes and reopens every game a change reaches (games/scripts/reopen.ts), next to the boot probe; games/scripts/contextIsolation.test.ts checks all ten games share nothing across contexts
- onContextDispose, disposeContext and publishForContext (core/runtime/contextDisposal), and publishOnPage/publishReadout (core/runtime/pageHandle)
- `RenderSink` (`@jgengine/core/devtools/renderCounter`): Where the UI runtime reports each render and commit.
- `CAPTURE_COMMAND_INPUT` (`@jgengine/core/game/captureCommand`): The input a capture command named by a bare string runs with: a neutral look, so a command that reads an aim or heading gets one. Also `CaptureCommandEntry`, `captureCommand`.
- `disposeContext` (`@jgengine/core/runtime/contextDisposal`): Close `ctx`: every cleanup registered on it runs, newest first, once. Also `onContextDispose`, `publishForContext`.
- `onPage` (`@jgengine/core/runtime/pageHandle`): What the page holds at `window.__jg[key]`, if anything. Also `JgPage`, `publishOnPage`, `publishReadout`.

### Fixed

- closing a game and opening it again in the same page works; it used to stop with "Rune supports one native surface per page"
- a closed game leaves no window listener, animation-frame loop, page global or WebGL context behind (all ten games, checked in a real browser)
- two game contexts in one process no longer share state: defineStore's starting value, Brightway Park's guests, staff, rides, bank, crowd, undo and menu state are per game
- the frame loop clears its redraw request before draws run, so a draw that asks for the next frame gets it
- a title screen whose save list storage refuses no longer throws an unhandled rejection; the refresh returns the failure

### Removed

- `@jgengine/core/devtools/agentBridge.draw` no longer exports `CAPTURE_COMMAND_INPUT`.
- `@jgengine/core/runtime/browserLifecycle.view` no longer exports `CAPTURE_HOLD_KEY`.
- `@jgengine/core/ui.view` no longer exports `CAPTURE_HOLD_KEY`.
