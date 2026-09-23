# Recipe — flight feel (aircraft as physical numbers)

**What this wires:** an aircraft that flies the way the brief says. There is no default jet or plane: every aircraft is a mass, an inertia tensor, a set of surfaces and an engine the game picks, checked against numbers it writes down first.

## The seams

- **Sim.** `createRigidAircraft(tuning, { position, velocity, heading | orientation, wind?, groundHeight?, gravityField?, airDensity? })` from `@jgengine/core/physics/aircraftDynamics`. It is a quaternion rigid body: surface forces act at their mount points on the inertia tensor, so nothing commands a rotation rate. `snapshot()`/`restore()` for prediction and replay, `retune()` for damage, upgrades and staging, per-tick `modifiers` (`thrustScale`, `liftScale`, `dragScale`, extra `force`/`torque`).
- **Body frame.** `[left, up, forward]` about the centre of mass. A wing panel sits at `[±semiSpan/2, 0, 0]`, a tailplane at `[0, 0, -tailArm]`, a fin at `[0, finHeight, -tailArm]` with `normal: [1, 0, 0]`.
- **Surfaces.** Each one has `area` (m²), `liftSlope` (per rad), `stallAngle` (rad), `postStallLift` (share of peak kept past the stall), `incidence` (trim), and the drag polar `cd0` + `inducedDrag·CL²`. Split the wing into left and right panels so ailerons have a roll arm.
- **Controls.** `control: { pitch?, roll?, yaw? }` on a surface is AoA change per rad of that channel's deflection. The sim signs it from the lever arm, so positive input is always nose up, right roll, nose right. Elevons are one surface with both `pitch` and `roll`. `controls.<channel>` sets `maxDeflection` and actuator `rate`.
- **Rotors.** A `rotor` block makes the same body a helicopter: `maxThrust` (N, full collective and rotor speed), `radius` (m), hub `at`, `torque` (N·m at full collective, positive yaws the nose left), `cyclic` disc tilt, `damping`, `spoolRate` and an optional `tail` rotor (`maxThrust`, `at`, `sideDamping`).
  - Throttle spins the rotor up; `input.collective` sets thrust; the pitch and roll channels tilt the disc; yaw drives the tail rotor.
  - Neutral pedal gives no tail thrust, so the nose swings with the torque until the pilot (or SAS) holds it. Hover pedal is `torque·collective / (tail.maxThrust · tailArm)`.
  - Thrust follows momentum theory: translational lift once clean air reaches the induced velocity `√(T/2ρA)`, less thrust while climbing through the disc, and Cheeseman–Bennett ground effect below about one rotor diameter.
  - The step's `rotor` telemetry (`speed`, `thrust`, `torque`, `groundEffect`, `translationalLift`) drives rotor sound, dust and HUD.
- **Pose.** Set the entity's `rotationY` from `step.heading` and apply the rest of `step.orientation` to the mesh (the heading-free part: `qY(-heading) · orientation`). `step.pitch`/`step.bank` match three.js `Euler(-pitch, heading, bank, "YXZ")`; `aircraftAttitudeQuaternion(heading, pitch, bank)` goes the other way for spawns.
- **Camera.** The chase rig (`rig: "chase"`) follows heading; give it `frustum: { far }` in the thousands and a `yawResponse` around 4 so the boom swings smoothly over the top of a loop.
- **Telemetry.** `airspeed`, `angleOfAttack`, `sideslip`, `gLoad`, `stalled`/`stallFraction`, `thrust`, body rates and `deflection` drive the HUD, stall horn, wind noise and camera shake.

## Workflow

1. **Write the feel as numbers.** Roll rate in deg/s, loop time, stall speed, the g it pulls at full stick, whether it holds level hands-off.
2. **Put them in a test** next to the tuning, flying the sim with fixed inputs.
3. **Start from the real aircraft**: mass, wing area, span, tail arm, thrust. Inertia is roughly `m·(span/4)²` for roll and `m·(length/4)²` for pitch and yaw.
4. **Trim it.** With the wing on the centre of mass, set wing `incidence` to the cruise lift coefficient over the lift slope, `W / (½ρV²·S·a)`, and leave the tail at `0`. It then flies level hands-off at that speed.
5. **Drive it**: `bun run drive flight --key KeyR+KeyS:10500 --key KeyD:1500 --record <name> --record-fps 20`, or `bun run drive flight-heli --key KeyR:1500 --wait 3000 --key KeyE:3500 --record <name> --record-fps 20` for the helicopter.

## Symptom → knob

| Symptom | Knob (direction) |
| --- | --- |
| Pitches up or down hands-off | wing `incidence` ↓ / ↑; wing further aft of the centre of mass ↑ stability |
| Loops too slowly | tail `control.pitch` ↑ (more AoA), entry speed or thrust ↑, `inertia.pitch` ↓ |
| Stalls in every hard pull | tail `control.pitch` ↓ so the elevator can't reach the stall angle, or wing `stallAngle` ↑ |
| Stall is a cliff / too gentle | `postStallLift` ↓ / ↑ |
| Rolls too slowly / too fast | aileron `control.roll` ↑ / ↓, wing panel `at` further out ↑ damping; `inertia.roll` sets how fast it gets there |
| Nose wanders, won't track | fin `area` ↑ or fin further aft |
| Controls feel laggy | `controls.<channel>.rate` ↑ |
| Top speed wrong | `engine.maxThrust`, `dragArea`, surface `cd0` |
| Bleeds speed in turns | `inducedDrag` ↓, wing `area` ↑ (lower CL for the same lift) |
| Throttle feels sluggish | `engine.spoolRate` ↑ |
| Helicopter won't hover / climbs away | hover collective is `weight / maxThrust` out of ground effect; `rotor.maxThrust` sets how much margin there is |
| Nose swings too hard without pedal | `rotor.torque` ↓, `inertia.yaw` ↑, `tail.sideDamping` ↑ |
| Pedal too weak to stop a swing | `tail.maxThrust` ↑ or tail rotor further aft |
| Cyclic twitchy / sluggish | `rotor.cyclic` ↓ / ↑, hub height (`rotor.at[1]`) ↓ / ↑, `rotor.damping` ↑ / ↓ |
| Pedal also rolls the body | tail rotor `at[1]` above the centre of mass; move it down or trim with cyclic |
| Sinks when it slows down | that is translational lift going away; `rotor.translationalLift` sets how much |

## Traps

- Setting orientation or angular velocity by hand defeats the model. Change a surface, the inertia or the control authority.
- A single centreline wing has no roll arm, so ailerons on it do nothing. Split it into left and right panels.
- For multiplayer, send inputs, not poses. Predict with the same tuning and `restore(serverState)` on correction.
