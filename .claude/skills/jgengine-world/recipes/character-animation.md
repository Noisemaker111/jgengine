# Recipe — character animation (graph → rig → ground)

**What this wires:** a rigged character that moves the way the game plays: clips chosen by data, feet that meet the ground, and gameplay moments keyed to animation frames. There is no default hero, soldier or NPC rig: every game picks its clips, parameters and corrections.

## The seams

- **Clips on a model.** `ModelConfig.animation` on an entity kind. A catalog model with indexed `clips` animates automatically through semantic clip roles; `"none"` holds the bind pose. `{ clip, paused, time }` holds one pose.
- **Graph.** `animation.graph` is an `AnimGraph` (`@jgengine/core/anim/animGraph`): layers, each a state machine of `clip`, `blend1D` and `blend2D` states joined by transitions with `when` conditions, `trigger`s, crossfade `duration` and `exitTime`. It is plain data, so it saves, diffs and can be authored in the editor.
  - `locomotionGraph({ idle, walk, run, walkSpeed, runSpeed, fadeSec, oneShots })` builds the idle/walk/run blend plus one-shots; `states`/`oneShots` configs are converted through it.
  - Upper-body actions (aim, reload, wave) go on a second layer with `mask: ["spine", "arm", ...]` bone prefixes, `additive` for recoil or breathing on top of the base.
  - `createAnimGraphRuntime(graph)` runs the same graph headless: `advance(dt, params, clips)`, `trigger`, `snapshot`/`restore`, `retune`. Test transitions with it before looking at pixels.
- **Parameters.** The shell feeds the entity's smoothed ground speed as `speed`. Anything else (aiming, crouched, strafe x/y) goes on the entity blackboard under `ANIM_PARAMS_KEY`.
- **Triggers.** `ctx.game.playEntityAnimation(id, name)` arms a trigger; `hit` and `death` arm from their combat events.
- **Events.** `graph.events: [{ clip, atSec, name }]` emit `animation.event` when a clip crosses that time. Hook footstep audio, the damage frame of a swing or the magazine swap of a reload to the event, not to a timer.
- **Root motion.** `rootMotion: true` on a state moves the entity by the clip's root-bone travel instead of playing it in place. Use it for dodges, vaults and attacks with lunges whose distance must match the feet.
- **Foot IK.** `ModelConfig.ik` runs after the mixer each frame.
  - `ik: "auto"` finds thigh → shin → foot chains by bone name. Pass `{ feet: [{ root, mid, tip }] }` when the rig's names are unusual, and `feet: []` to keep only `lookAt`.
  - Each foot keeps its animated swing and moves by its ground's height above or below the model origin. The pelvis drops so the lower leg can reach, soles never end under the ground, and planted feet tilt to the ground normal (`alignToGround`, `0..1`). The correction fades out while the feet are clear of the ground.
  - `maxAdjust` caps the correction as a fraction of leg length (default `0.4`). Probes hit terrain and blocking physical objects, never the model's own entity.
  - The pure pieces are `placeFeet` and `inferLegChains` (`@jgengine/core/anim/footPlacement`) and `solveTwoBone`/`solveFabrik`/`lookAt` (`@jgengine/core/anim/ikSolver`), for a custom host or a non-leg chain (a hand on a ledge, a tail).

## Symptom → knob

| Symptom | Knob |
| --- | --- |
| Feet slide at walk or run speed | `walkSpeed`/`runSpeed` to the clip's authored stride speed, or blend1D `at` points |
| Pop between states | transition `duration`; `exitTime` on one-shots returning to locomotion |
| Feet float or sink on slopes and steps | `ik: "auto"` |
| Knees buckle on steep ground | lower `ik.maxAdjust` |
| Feet tilt wrongly on rubble or props | lower `ik.alignToGround` |
| Attack damage lands before the swing | `graph.events` on the hit frame instead of a timer |
| Lunge distance doesn't match the feet | `rootMotion: true` on that state |
