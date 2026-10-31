jgengine create writes a game that plays from second 0, with a main menu, settings, credits, a plan, a probe and a from-zero proof; every game gets an F3 perf overlay, replay and a context-loss screen.

Closes #2837 (line S4)

Engine seam: packages/jgengine/src/templates/starterGame.ts, packages/core/src/menu/gameFlowMenus.view.tsx, packages/core/src/devtools/perfOverlay.draw.tsx, packages/core/src/replay/replayRecording.ts, packages/core/src/replay/replayPlayback.draw.ts, packages/core/src/play/playSession.draw.ts, packages/shell/src/Shell3dPresentation.tsx, packages/shell/src/ShellChrome.tsx, packages/shell/src/presentationRecovery.tsx, packages/shell/src/drivers/FrameDriver.tsx, games/scripts/designBrief.ts

### Added

- jgengine create writes a 3d game that plays from second 0: a main menu (New game, Continue, Controls, Settings, Credits) in the game's own kit, credits read from jgengine.json, and a starter loop of walk, gather, an energy meter, a rank ladder that unlocks sprint and a beacon goal, built on statPool, thresholds, predicate, pacedSchedule and pick.
- Every scaffold writes PLAN.md (Direction, Features, Gaps, Milestones, design brief pending), src/game/probe.ts, proofs/flows/from-zero.flow.ts that reaches the goal through real keys inside the first minute, and perf-budget.json. `create --brief "<words>"` fills the plan's Brief line.
- games-design passes a pending brief until milestone 1 is ticked and requires the full brief from then on; games-depth only requires the from-zero proof to play until then, with its bars unchanged.
- GameFlowUI title and pause menus open the engine settings surface and show a sectioned credits document, so the games already on it gain Settings.
- Every 3D game gets an F3 perf overlay (FPS graph, draws, nodes, programs, costliest subsystems), a per-session input-plus-seed replay saved with F2+R and played back headless with `playReplayRecording`, and a context-loss screen instead of a black frame.
- `createReplayRecorder` (`@jgengine/core/replay/replayRecording`), `playReplayRecording` (`@jgengine/core/replay/replayPlayback.draw`), `PerfOverlay` (`@jgengine/core/devtools/perfOverlay.draw`); `createPlaySession` takes a `recorder` and `tick(held, dt?)`.

### Fixed

- The builder template binds no pause key, since it has no game-flow pause.
