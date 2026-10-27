Headless runs now behave like play by default, so the traps a game build hit only at runtime are gone or are type errors: a whole game boots from what `defineGame` returns, a long step runs all of its time, saves round-trip, the camera's turn steers the walk, a teleport moves the body the player controls, and proof probes are typed from the game.

Engine seam: packages/core/src/runtime/headlessRunner.ts, packages/core/src/runtime/simSnapshot.ts, packages/core/src/movement/teleport.ts, packages/core/src/game/playableGame.ts, packages/shell/src/defineGame.tsx

Prevention: headless runner tests (a 10 s step runs 200 frames; a 60 Hz game gets all 300 ticks of a 5 s step; the walk controller is on for a game that binds walk keys and off for one that does not; `ctx.camera.turnTo` steers the walk; a system's save comes back on restore; a whole playable boots with its content and movement), teleport tests (riding: the mount moves and the rider comes along, then walks on from there; on foot: no carried velocity; a NaN coordinate throws).

Bends: the old "clamps a long stall to maxStepSeconds" test is replaced; it asserted the clamp this change removes. Beacon Bastion's "never sitting on a fortune" pacing check now reads the most gold left right after each shopping trip instead of the purse at the instant the run ends: with the clock at full speed (abilities recharge as they do in play) the final boss's bounty lands in the last second, 573 gold the keep never had a turn to spend, while the purse stayed at or under 182 for the whole defense. The 300 limit is unchanged.

### Migrate

- `HeadlessRunner.step(dt)` advances all of `dt` now, in frames of at most `maxStepSeconds` (default 0.05 s); it used to clamp the step to one frame and drop the rest. Code that stepped many small frames keeps working; code that relied on the clamp gets the time it asked for.
- `HeadlessRunner.snapshot()`/`restore()` capture `ctx.state()` (every system's save) instead of the replication view.
- `createHeadlessRunner` turns on the walk controller when the game's input binds a walk action (`moveForward`, `moveBack`, `moveLeft`, `moveRight`, `jump`), as the shell does; pass `playerMovement: false` to keep it off. With no `loop`, it runs the definition's own loop (and so its `systems`).

### Added

- `createHeadlessRunner({ game })` boots a whole playable game (what `defineGame` returns): content, phase-synced loop, movement and collision config come from it, and passing them alongside `game` is a type error. `HeadlessRunner.look` reads the heading the walk steers by.
- `teleportPlayer(ctx, userId, { x, z, y?, yaw? })` (`@jgengine/core/movement/teleport`) moves the body a player controls (their mount while riding), drops carried velocity, snaps the render pose and turns the camera.
- `PlayableGame<TProbe>` and `GameCaptureConfig<TProbe>`: `defineGame` infers what `capture.probe` returns, so tools reading `typeof game` see each probe by name. `ProbeReadings` names the shape.

### Fixed

- The headless runner ignored the game's own `ctx.camera.turnTo`, so a teleport cheat that faced the camera left headless walks going the old way.
- A fixed-rate game stepped headlessly lost every tick past its catch-up cap on a long step.
