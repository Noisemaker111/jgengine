# Recipe — NPC senses (perceive → remember → decide → route)

**What this wires:** an NPC that notices things, remembers where they were, acts on
that memory, and gives up when it goes stale. A guard that hears a sprint and
checks it out, a mob that leashes home, a pedestrian that flees a gunshot and a
patrol car that drives to the last sighting are all this loop with different
facts, graphs and speeds. No archetypes: the NPC is data plus a few named actions.

Working example: the `guard-probe` dev demo (`apps/dev/src/demo/guardProbe.ts`),
`bun run drive guard-probe`.

## The seams

- **Perceive → memory.** One `createPerception` per group of NPCs that share
  senses. Each tick, push the stimuli your game produces (`sound` with a
  `loudness` that scales range, `damage`) and call `observe(npc, candidates, nowMs)`
  with a *bounded* candidate list from a spatial query, never every entity. Pass
  `occluded` for walls. Memory decays linearly over `memorySeconds`; each observer
  judges a stimulus once.
- **Memory → blackboard.** A small system copies the facts the graph needs into
  the NPC's persistent blackboard: `behaviorControl(ctx).blackboard(id)`. Write
  plain scalars (`alerted`, `lastKnownX`, `lastKnownZ`, `confidence`). Actions
  and conditions read facts; they do not query the world for them.
- **Blackboard → decision.** The NPC's `decisionGraph` behavior is data:
  conditions on blackboard keys, `memory` sequences for multi-step errands
  (go → `wait` → give up), `cooldown` for barks, `random` (drawn from `ctx.rng`)
  for idle variety. Register actions by name with `registerBehaviorActions`, and
  release movement or claims in `onAbort` when a higher branch pre-empts them.
  Set `thinkInterval` so a crowd thinks a few times a second.
- **Decision → route.** Actions that move ask one `createNavMeshQuery(mesh)` per
  mesh for `findPath` and replan only when the goal moves. Bake the mesh from
  scene geometry with `@jgengine/navbake` (`await initNavBake()`, then
  `bakeNavMesh`) and store it as an editor `nav` bake; price hazards or lock doors
  with `areaCosts` through `retune`.

## Gotchas

- Hand the graph facts, not objects: the blackboard serializes with the behavior,
  so saves and replays keep an NPC mid-investigation.
- Judge footstep noise on speed averaged over a window, not one frame; frame-time
  jitter otherwise reads as a sprint.
- Record the stimulus you handled (`handledAt`) so giving up does not
  re-alert on the same memory next tick.
