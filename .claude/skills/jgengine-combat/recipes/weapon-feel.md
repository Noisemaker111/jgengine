# Recipe — weapon feel (feel target → metrics → handling knobs)

**What this wires:** a weapon that handles the way the brief says, from the shot to the camera, sound and rumble. There is no default rifle or shotgun: every weapon is a set of angles in radians and times in seconds that the game picks, checked against numbers it writes down first. A looter shooter's generated guns are the same fields, rolled from the game's own parts tables.

## The seams

- **Cadence and ammo.** `createWeaponRuntime` or `weaponFire` + `magazine`, per the [portable weapon-plumbing recipe](portable-weapon-plumbing.md). Each time the cadence fires, call `handling.fire(stance)`.
- **Handling.** `createWeaponHandling(tuning, { random: ctx.rng })` from `@jgengine/core/combat/weaponHandling`.
  - `recoil`: a `pattern` of `[pitch, yaw]` kicks per shot (or a flat `pitch`), `randomCone` from the injected RNG, `cameraShare` (view punch versus aim kick), `recoverRate`/`recoverDelay`, `adsScale`.
  - `spread`: `base`, `perShot` bloom, `max`, `recoverRate`/`recoverDelay`, and `ads`/`crouching`/`moving`/`airborne` multipliers.
  - `adsTime`.
  - Sample the shot direction inside `fire().spread`. Add `tick(dt, stance).aimPitch/aimYaw` to the aim and `cameraPitch/cameraYaw` to the view only.
  - `snapshot`/`restore` for prediction and replay; `retune` for attachments, parts and upgrades mid-fight.
- **Presentation.** Return `{ handling: handling.frame(), presentation }` from `camera.weapon(entityId)`, with a `createWeaponPresentation` tuning (`@jgengine/core/combat/weaponPresentation`): `hip`/`ads` viewmodel offsets, `viewmodelFov`, `adsZoom`, `sway`, `bob` and `kick`. The `first` rig poses the viewmodel, adds recoil to the look and zooms with `adsProgress`. The `shoulder` rig takes its ADS framing and recoil from the same frame.
- **Feedback.** `createWeaponFeedbackSignals()` from `@jgengine/core/combat/weaponFeedback`.
  - Call `signals.shot(handling.fire(stance))` on each shot and `signals.impact(damage)` when a hit lands.
  - Each tick, `mixer.update(dt, signals.read(handling.tick(dt, stance)))` on a `createFeedbackMixer` (`@jgengine/core/vfx/feedbackMixer`) the game declares.
  - `kick`, `shot` and `impact` are one-tick pulses. Route `kick` without smoothing into a trauma target and pass it to `createCameraShake().add(...)` (`@jgengine/core/vfx/cameraShake`), so trauma lands once per shot.
  - Route `impact` with a `release` into rumble targets for `ctx.input.rumble`, rate-limited to about 10 Hz. A threshold `event` on `impact` gives a hit-confirm one-shot.
  - Play the gunshot once per `shot` count. `ads` and `spread` suit continuous targets such as a muffled gun tail or a HUD crosshair gap.
- **Proof.** `measureWeapon(() => createWeaponHandling(tuning), { interval, burst, damage, pellets, targetHealth, range, targetRadius, damageAt, stance })` returns deterministic numbers:
  - `spreadByShot`, `firstShotSpread` and `tenthShotSpread`.
  - `burstClimb`: set `burst` to the magazine size for climb over a magazine.
  - `resetSeconds` and `adsSeconds`.
  - `shotsToKill` and `timeToKill`: expected damage, where each projectile hits by the share of its cone the target covers at `range`, scaled by the game's `damageAt` falloff.

## Workflow

1. **Write the feel as numbers** on the `WeaponReport` fields. Some examples:
   - "Laser beam when aimed" is `spreadByShot[29] < 0.01` rad with `stance: { ads: true }`.
   - "Controllable" is `burstClimb` under about 3° over the magazine and `resetSeconds < 0.5`.
   - "Close-range only" is `timeToKill` at 5 m near `0` and above 2 s at 30 m.
   - "Snappy sights" is `adsSeconds < 0.2`.
2. **Put them in a test** next to the tuning, one `measureWeapon` call per weapon or per rolled part set.
3. **Move one knob at a time** using the table below, and rerun after each change.
4. **Fire it** in the game (`bun run drive <game> --record <name>`, per `jgengine-verify`). The tests prove the numbers; the recording proves the kick, shake and sound read right.

## Symptom → knob

| Symptom | Knob (direction) |
| --- | --- |
| Muzzle climbs out of control over a magazine | `recoil.pattern` pitch ↓, `recoverRate` ↑, `recoverDelay` ↓ |
| Kick feels weak but aim stays true | `cameraShare` ↑: more view punch, same aim |
| Spray is unlearnable | `randomCone` ↓, keep the drift in `pattern` |
| Accurate forever while held | `spread.perShot` ↑, `max` ↑ |
| Bloom never settles between bursts | `spread.recoverRate` ↑, `spread.recoverDelay` ↓ |
| Hip fire too good versus aiming | `spread.ads` ↓, `recoil.adsScale` ↓ |
| Sights feel sluggish | `adsTime` ↓ |
| Shotgun kills at sniper range | `spread.base` ↑ or a steeper `damageAt` falloff |
| Every shot shakes the same | route `kick` through a `curve` so the shake scales with the kick |
