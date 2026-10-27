Proof flows are TypeScript: <game>/proofs/flows/<name>.flow.ts exports defineFlow(game, { state?, browser?, run(f) }) with typed keys and chords, probe checks typed from the game's own capture.probe, f.heading, f.teleport, f.command, f.timeScale and f.waitFor. bun run drive <game> --flow <name> plays it headless by default (under a second where the browser took half a minute) or in the browser with browser: true or --browser. A pass prints one line; a failure names the step, the probe readings and the steps before it. Every game's flows are converted.

Engine seam: packages/core/src/devtools/agentBridge.draw.ts, packages/core/src/play/flow.ts, packages/core/src/play/flowSteps.ts, packages/core/src/play/headlessFlow.draw.ts, packages/core/src/play/playRunner.draw.ts, packages/core/src/play/playSession.draw.ts, packages/core/src/runtime/headlessRunner.ts, packages/jgengine/src/templates/captureArgs.ts and 4 more

### Migrate

- rewrite each proofs/flows/<name>.json as <name>.flow.ts with defineFlow, add "proofs" to the game's tsconfig include, and name the capture state in the flow (state: "...") instead of passing --state.

### Added

- the agent bridge answers camera_heading { yaw } and teleport { x, z, y?, yaw? }.
- `FLOW_PRESS_MS` (`@jgengine/core/play/flow`): How long {@link Flow.press} holds its keys. Also `BrowserFlow`, `BrowserFlowSpec`, `BrowserProofFlow`, `FLOW_WAIT_MS`, `Flow`, `FlowCommandResult`, `FlowHold`, `FlowKey` and 7 more.
- `FlowFailure` (`@jgengine/core/play/flowSteps`): The step a flow failed at and why, with the probe readings at that moment when the game has a probe. Also `FlowRunReport`, `FlowStepRecord`, `FlowStepper`.
- `runFlowHeadless` (`@jgengine/core/play/headlessFlow.draw`): Play a proof flow headless: the real game through {@link createPlaySession}, keys mapped to the game's own bindings, every wait in game time, so a flow that takes a minute in the browser takes seconds here. Also `HeadlessFlowOptions`.
- `createPlaySession` (`@jgengine/core/play/playSession.draw`): Boot a `PlayableGame` through the headless runner and tick it the way the shell does: movement from held actions, then the per-frame action phase (bound commands, prompts, hotbar). Also `PlaySession`, `PlaySessionOptions`.

### Changed

- Proof flows are TypeScript: <game>/proofs/flows/<name>.flow.ts exports defineFlow(game, { state?, browser?, run(f) }) with typed keys and chords, probe checks typed from the game's own capture.probe, f.heading, f.teleport, f.command, f.timeScale and f.waitFor. bun run drive <game> --flow <name> plays it headless by default (under a second where the browser took half a minute) or in the browser with browser: true or --browser. A pass prints one line; a failure names the step, the probe readings and the steps before it. Every game's flows are converted.

### Fixed

- headless runs start on the game's camera.initialYaw, so a walk faces the same way as in the page.
- bun run check games-design checked no games when run from the repository root, as CI runs it; it now checks all 18.

### Removed

- the JSON flow format, and drive's --steps and --check flags with the look, aim-at and move-mouse steps; f.heading replaces them.
