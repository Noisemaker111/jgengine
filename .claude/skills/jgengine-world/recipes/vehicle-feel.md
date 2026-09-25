# Recipe — vehicle feel (feel target → metrics → physical knobs)

**What this wires:** a ground vehicle that feels the way the brief says, from sim to camera, sound and rumble. There is no default car: every vehicle is a set of physical numbers the game picks for its own feel, checked against metrics it writes down first.

## The seams

- **Sim.** `createVehicleDynamics(tuning, { surfaceFriction?, clampMove?, groundHeight? })` from `@jgengine/core/physics/vehicleDynamics`. Yaw comes from tire forces, so balance, slides and recovery are outcomes of the numbers, not special cases. It has `snapshot()`/`restore()` for prediction and replay, `retune()` for upgrades and damage, and per-tick modifiers (`driveScale`, `gripScale`, `steerScale`, `brakeScale`, `thrust` for boost).
- **Terrain.** Add a `suspension` block (spring and damper rates, travel, ride height, anti-roll) and pass `groundHeight` for ramps, hills and jumps. Each wheel then samples the ground, the body heaves, pitches and rolls on real springs, slopes pull the car downhill, and the step reports `airborne`, `landingSpeed` and per-corner `wheelLoads`. Without the block the car stays on a flat plane.
- **Input.** Put `createAxisShaper` (`@jgengine/core/input/axisShaper`) between `ctx.input.axis(...)` and the sim. Keys get `riseRate`/`returnRate`, so a tap steers a little and a hold builds up; sticks get `deadzone`/`curve` with no lag. Pass `{ analog: analogAxes(bindings, ctx.input.analog()) }` each frame so each axis picks the right profile.
- **Pad feel.** Set the stick deadzone, curve and trigger deadzone once in `defineGame({ gamepad: { deadzone, curve, triggerDeadzone } })`. The shell applies it before any analog value reaches `ctx.input`, so per-axis shaping in `createAxisShaper` only adds ramps and speed scaling on top.
- **Jumps and air.** With `suspension`, a `jump` block (`speed`, `count` for double jumps, `window`) enables `car.jump()`, and an `air` block (`pitchAccel`/`yawAccel`/`rollAccel`, `damping`, `maxRate`) rotates the body in flight. Air input comes from `modifiers.air`; without it, throttle−brake pitches and steer yaws, which suits Rocket League-style play. Pass `{ pitch: 0, yaw: axis.steer, roll: 0 }` if W should keep driving instead of nosing down. `applyAngularImpulse` composes dodges and flips. The body stays near level, so full flips and wall-driving wait for the rigid-body backend.
- **Boats.** `createBoatDynamics` (`@jgengine/core/physics/boatDynamics`) takes the same axis input and returns a step `tickDrivableVehicle` and `measureHandling` accept. Its knobs are mass, length, beam, prop thrust and prop speed, `planingSpeed`, `keel` and `steering` (`rudder` with an area, or `outboard`). A tug and a speedboat differ only in those numbers.
- **Collision.** In a `PhysicsBackend` world (Rapier or `PhysicsWorld`), `createVehicleBackendLink` gives the car a kinematic chassis that shoves props, and a `clampMove` that stops it at walls. The sim keeps the handling, so the feel numbers above still hold.
- **Two wheels.** A `lean` block (`maxLean`, `leanRate`, optional `countersteer`) turns the same sim into a motorcycle or bicycle.
  - Steer asks for a lean, and the bar steers the balanced turn that lean needs.
  - The bike tips the other way briefly as the lean starts, which is countersteer.
  - The step reports the balance lean `atan(lateral g)` as `lean`, with `bodyRoll = -lean`. The requested lean is capped at what grip can hold.
  - `wheelie`/`stoppie` flags come from axle loads. `assists.antiWheelie` and `assists.antiStoppie` cap drive and braking just under the pitch-over limit, and on springs they also back off as the axle goes light. A sprung bike needs them to stay playable.
  - `measureLean` reports steady lean, time to lean and counter-lean.
- **Pose.** `tickDrivableVehicle(car, dt, ctx.input.axis(bindings, ranges), { groundHeight })` returns a `setPose` patch. Pitch and roll come from load transfer, or from the springs when `suspension` is set.
- **Camera.** `camera: { rig: "chase", chase: { fov, lead, bank, velocityYaw, yawResponse } }`. `velocityYaw` shows the car's side in a slide, and `fov` widens with speed.
  - Speed comes from the entity's sim `velocity`, so publish poses with `setPose({ ..., dt })` (`tickDrivableVehicle` does). `fov.response` eases the FOV.
  - The boom holds its length at any speed. `distanceBySpeed: { extra }` pulls it back on purpose; `ctx.camera.kickFov(deg)` adds a decaying punch for landings and hits.
  - `pitchFollow` tilts the boom with `rotationX` on ramps and slopes. `lookBackAction` names an input action that looks behind while held.
  - The boom stops short of objects, terrain and walls through `ctx.scene.raycast`; `collision: false` turns that off.
  - Switch views at runtime with `ctx.camera.setChaseTuning({ ...ctx.camera.chaseTuning(), view: nextChaseView(view) })` (`@jgengine/core/runtime/cameraDirector`).
- **Sound.** Call `ctx.game.audio.loop(id, sound)` once, then `setLoop` every tick:
  - Engine: `rate` from `step.rpm`, `gain` from `step.engineLoad`.
  - Tires: `gain` from how far `max(step.frontSaturation, step.rearSaturation)` exceeds ~0.85.
  - Real engine samples: `createEngineLayers` (`@jgengine/core/audio/engineLayers`) takes N loops keyed by the rpm they were recorded at, crossfades the two around the current rpm, and picks on-load or off-load sets by `engineLoad`. Call `update(dt, { rpm, load })` then `play(ctx.game.audio, { at, velocity, gain, lowpass })` each tick.
  - `setLoop` also takes `lowpass`/`highpass` cutoffs in Hz (muffle off-throttle) and `velocity`; a sound with `doppler: 1` pitches by listener and emitter velocity.
- **One place for all of it.** `createFeedbackMixer` (`@jgengine/core/vfx/feedbackMixer`) declares these mappings as routes: `{ signal, target, curve, attack, release }`, with `max` or `sum` combining and threshold `events` for one-shots like a landing thud. Update it with the step's telemetry each tick and apply its targets to `setLoop`, the chase camera and `haptics`, instead of hand-writing the glue.
- **Rumble.** Set continuous channels each tick on `ctx.input.haptics(userId)`: `set("road", { strong: rearSaturation, weak: frontSaturation })`, an `engine` hum from load and rpm, and `pulse("impact", { strong, weak, ms }, 1)` on a landing so it ducks the rest. The shell mixes them by priority onto that player's pad. `ctx.input.rumble` stays for a single fire-and-forget effect.
- **Sound.** Play a one-shot on `step.landingSpeed` (thud, suspension clunk).
- **Proof.** For jumps and air control, `measureAir` reports apex height and time, double-jump height, and air rotation rates.
- **Proof.** `measureHandling(() => createVehicleDynamics(tuning), options?)` from `@jgengine/core/physics/handlingProbe` returns deterministic numbers. Assert them in a test. For a sprung car, `measureRide` adds settle time, brake dive, roll per g and landing bounces.

## Workflow

1. **Write the feel as numbers before tuning.** Turn the brief into target ranges on the `HandlingReport` fields. Some examples:
   - "Snappy" is `turnIn < 0.2`.
   - "Planted" is `maxLateralG` close to the tire μ with `stepPeakSideslipDeg < 8`.
   - "Drifty but safe" is `handbrakePeakSideslipDeg` 40–70 with `spun === false`.
   - "Keyboard-friendly" is `spun` and `powerSteerSpun` both `false`, including at `cornerSpeed: 40`.
   - "Neutral balance" is `measureCourse(...).understeerGradient` near 0–0.5 deg/g; "tail-happy" is below 0.
   - "Agile" is a high `measureCourse(...).slalomSpeed`; "forgiving" is a short `handbrakeRecoverySeconds`.
2. **Put those ranges in a test first**, next to the tuning.
3. **Start from the real vehicle's physical numbers**: mass, wheelbase, weight split, CoM height, driven axle, torque and gears. Then move one knob at a time using the table below, rerunning the test after each change.
4. **Drive it.**
   - In the engine repo: `bun run drive <game> --key KeyW:4000 --probe a --key KeyW+KeyD:1500 --probe b --record <name>`. Chords hold throttle and steer together.
   - `--record-fps 20` keeps game time at 1:1, because each recorded frame advances at most one 50 ms step.
   - Tests prove the numbers; the drive proves the camera and sound.

## Symptom → knob

| Symptom | Knob (direction) |
| --- | --- |
| `understeerGradient` too high | front tire `peakSlipAngle` ↓ or rear ↑ (tire stiffness split is what moves it at moderate g) |
| Pushes wide, won't turn in | `rollStiffnessFront` ↓, rear `peakGrip` ↓ relative to front, `yawInertiaIndex` ↓, `steering.rate` ↑ |
| Snaps into oversteer | `rollStiffnessFront` ↑, rear `peakGrip` ↑, `slideGrip` ↑ (gentler breakaway), `assists.stability` ↑ |
| Spins holding throttle and steer | `assists.tractionControl` ↑ (budgets for cornering grip), `driveFront` ↑, peak torque ↓ |
| Slides feel uncatchable | `steering.selfAlign` ↑ (caster catches the slide), `slideGrip` ↑, `assists.maxSideslip` ↑ with `stability` ↑ |
| Too twitchy at speed | `steering.highSpeedAngle` ↓, `steering.rate` ↓, `yawInertiaIndex` ↑, shaper steer `digital.riseRate` ↓ |
| Keyboard steering is all-or-nothing | shaper steer `digital.riseRate` 2–4/s, `returnRate` 5–8/s |
| Stick feels twitchy on centre | shaper steer `analog.curve` 1.3–2, `analog.deadzone` 0.05–0.12 |
| Sluggish, boat-like | `yawInertiaIndex` ↓, `peakSlipAngle` ↓ (stiffer tire), `comHeight` ↓ |
| Handbrake does nothing / spins every time | `handbrakeGrip` ↓ / ↑, with `selfAlign` to set how it recovers |
| No top speed ceiling / wrong ceiling | `aero.dragArea`, power (`maxPower` or torque × gearing); `speedLimit` only for a hard governor |
| Boost or supersonic above the cap | `modifiers.thrust` (bypasses tires and the governor) |
| Floaty, wallowy body | `suspension.springRate` ↑, `damperRate` ↑ |
| Harsh, skips over bumps | `springRate` ↓, `travel` ↑ |
| Landings bounce back into the air | `suspension.reboundRate` ↑ (defaults to 1.5 × `damperRate`), `travel` ↑ |
| Leans too much / feels flat | `suspension.antiRoll` ↑ / ↓; `rollStiffnessFront` still sets which axle takes it |
| Jump too floaty / too short | `jump.speed` (apex ≈ speed² / 2g); `jump.count: 2` plus `window` for a double jump |
| Air rotation too twitchy / sluggish | `air.*Accel` for how fast it builds, `air.maxRate` for the ceiling, `air.damping` for how fast it stops |
| Bike wheelies on launch / flips over the bars braking | `assists.antiWheelie` / `assists.antiStoppie` ↑ (1 keeps both wheels down; 0.6 lets it lift briefly) |
| Bike tips in lazily / nervously | `lean.leanRate` ↑ / ↓ (2 tourer … 5 sport); `lean.countersteer` sets the wrong-way tip at the start |
| Rolls over in corners | `comHeight` ↓ or `trackWidth` ↑: it tips over at about `trackWidth / (2 · comHeight)` g |

## Traps

- Hand-editing `yawRate` or heading to "fix" a turn defeats the model. Change a physical knob instead.
- `speedLimit` fades drive out and never clamps velocity. A car pinned at its cap can still turn, and thrust can carry it past the cap.
- A slide that looks right on a gamepad can spin on a keyboard. Assert `powerSteerSpun` and `spun` with the default `stepSteer: 1`, which is a held key.
- For multiplayer, send inputs, not poses. Predict locally with the same tuning, and on a correction call `restore(serverState)` and replay the buffered inputs.
