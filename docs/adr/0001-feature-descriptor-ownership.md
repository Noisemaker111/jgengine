# 0001 — FeatureDescriptor owns subsystem lifecycle; GameLoop.onTick owns simulation

- Status: Accepted
- Date: 2026-07-16
- Deciders: engine
- Supersedes: none
- Informs: #11 (FeatureDescriptor seam, done), #14 (per-descriptor save/restore, next), #37 (this ADR)

## Context

`gameContext.ts` carries three mental models for "an entity/behaviour lives here and advances over time," with no written rule saying which one owns the tick. Each audit (gpt/grok/sonnet) independently flagged the ambiguity as the top architectural problem behind the save and replication gaps.

The three models, as they exist in the tree today:

1. **Bag-of-entities — `entityStore`** (`packages/core/src/runtime/`, wired into `ctx.scene.entity`). A passive, id-keyed store: `snapshot()`, `hydrate()`, `update()`, `setPose()`, `get`/`list`/`ids`, blackboard, stats. It holds no clock and never self-advances — something else must call into it each frame.

2. **Subsystem facades — the `FeatureDescriptor` array** (`gameContext.ts:553-805`). #11's seam: each opt-in `GameFeatures` flag maps to one descriptor whose `create(deps)` returns a `FeatureBuild` — `{ value, replicate?, save? }`. `createGameContext` iterates the list (`:1648-1654`), registering each `value` under `ctx.game.*` / `ctx.player.*`, its `replicate` into the host→client set and its `save` into the persistence set. The descriptor is the composition seam, but today it only owns **construction and serialization** — it cannot advance state and cannot release resources.

3. **Bolted-on `Behaviour` lifecycle** (`packages/shell/src/behaviour.ts`, `behaviourDriver.ts`, `behaviourAttach.ts`, over `packages/core/src/behaviour/behaviour.ts`). A Unity-style `onAwake→onEnable→onStart→onUpdate→onDisable→onDestroy` node tree ported from three-start. `useBehaviourWorld` calls `world.update(dt)` **every render frame** as a second, independent tick loop. It is marked `@internal`, lives entirely in `shell`, is keyed by `Object3D.uuid` rather than entity instance ids, and has **no** connection to `entityStore`, to snapshot/replication, or to host authority.

The friction this produces:

- **Two competing ticks.** `GameLoop.onTick(ctx, dt)` (`defineGame.ts:59`, the game-authored simulation hook driven by the shell's scaled clock) and the `Behaviour` world's per-frame `world.update(dt)` both advance state, but only `onTick` runs on a hosted authority. A behaviour that mutates game state ticks on the client render loop and never reaches the snapshot — silently client-only, the exact "multiplayer defaults are silently not multiplayer" failure class.
- **Hand-wired subsystems bypass the descriptor seam.** `time` (`createSimClock`, `:817`), `stats` (`statsByInstance`, `:825`), `pose` (`createPoseState`, `:993`), `possession` (`createPossession`, `:1013`) and `motion` (`createMotionIntents`, `:1616`) are constructed inline and, where they persist at all, are appended by hand to the `snapshotModules` / `saveModules` arrays (`:1656-1711`). Their save/replicate wiring is a parallel code path the descriptor loop cannot see.
- **Silent save/replication gaps.** Because descriptors only carry an optional `save`/`replicate`, several ship with neither: `cosmetics` (`:674`), `cards` (`:785`), `turn` (`:792`) and `race` (`:799`) register **no** save module — turn counters, card-pile contents, race progress and equipped cosmetics are lost across a save/restore. `possession`, `pose` and `time` never appear in `saveModules` at all. This is the #14 gap.

## Decision

### 1. `GameLoop.onTick` is the single authoritative simulation tick

`GameLoop.onTick(ctx: GameContext, dt: number)` (`defineGame.ts:59`; hosted twin `ServerLoopHooks.onTick`, `gameRuntime.ts:17`) is **the** tick. It is the only place simulation state advances, and on a hosted world it is the only tick that runs on the authority. Everything a frame must advance is reached from `onTick`, directly or through the descriptor tick pass (below).

The other two models reconcile under it:

- **`entityStore` stays a passive bag.** It never grows a clock. `onTick` (and commands) mutate it; it serializes cleanly via its `snapshot`/`hydrate` module. This is already true and is now the rule.
- **`Behaviour` is demoted to a render-only view concern.** The `Behaviour` world MUST NOT own simulation tick. `onBeforeRender`/`onAfterRender` and view-side interpolation are legitimate; mutating authoritative game state from `Behaviour.onUpdate` is not. Its `world.update(dt)` is driven from the game clock (via `onTick` / the shell's scaled dt), never from a second free-running frame loop, so it cannot advance state the snapshot doesn't see. Behaviours that today carry game logic move that logic into a subsystem behind a descriptor, or into `onTick`.

### 2. The `FeatureDescriptor` contract owns the full subsystem lifecycle

A descriptor is the one place a subsystem declares how it is built, advanced, replicated, persisted, restored and disposed. `FeatureBuild` widens from a serialization pair into a lifecycle handle:

```ts
interface FeatureInstance {
  /** The ctx-facing facade registered under ctx.game.* / ctx.player.* (unchanged). */
  value: unknown;
  /** Advance one simulation step. Called by createGameContext's tick pass, itself
   *  driven by the single GameLoop.onTick — NOT by any render frame loop. Omit for
   *  purely event/command-driven subsystems (unlocks, roster, trade). */
  tick?(dt: number): void;
  /** Host→client replication module (ctx.snapshot()/ctx.hydrate()). Unchanged. */
  replicate?: SnapshotModule;
  /** Persistence module (ctx.game.save/restore). save ⊇ replicate; a descriptor that
   *  replicates and also persists provides both. Restore is the module's hydrate(). */
  save?: SnapshotModule;
  /** Release timers, listeners, GPU/audio handles on stop()/unmount. Runs in LIFO
   *  with the rest of the context teardown. Omit if the subsystem holds no resources. */
  dispose?(): void;
}

interface FeatureDescriptor {
  /** Widened beyond keyof GameFeatures so always-on baseline subsystems
   *  (entities, stats, store, feed, inventory, economy) are descriptors too. */
  readonly key: FeatureKey;
  enabled(features: GameFeatures): boolean; // always-on baseline returns true
  create(deps: FeatureDeps): FeatureInstance;
}
```

`createGameContext` runs one loop over `[...baselineDescriptors, ...featureDescriptors]` and, per enabled descriptor, collects `value`, `tick`, `replicate`, `save`, `dispose`. The four inline arrays it maintains today — the descriptor loop plus the hand-written `snapshotModules`, `saveModules`, and scattered dispose calls — collapse into that one pass. This yields four assembled sets with **no hand-maintained membership**:

- `snapshotModules` = every descriptor's `replicate` (host→client baseline).
- `saveModules` = every descriptor's `save` (persistence superset; unchanged invariant that `save ⊇ replicate`).
- the tick pass = every descriptor's `tick`, invoked in registration order from the single `onTick` driver.
- context teardown = every descriptor's `dispose`, LIFO.

`save`/`replicate` are `SnapshotModule` (`worldSnapshot.ts:7`), so restore is already the module's `hydrate(data)` — per-descriptor save/restore falls out for free once a subsystem owns its `save`. That is the contract #14 builds on: #14 becomes "give each named subsystem below a `save` module," not new plumbing.

### 3. Subsystems that move under descriptor ownership

Every subsystem currently hand-wired outside the descriptor loop, and every descriptor missing `save`, is brought under the contract. Concretely:

| Subsystem | Today | Gains | Notes |
| --- | --- | --- | --- |
| `time` (`createSimClock`, `:817`) | inline construct, no save | `tick`, `save` | clock must advance each step and persist calendar/scale/speed |
| `stats` (`statsByInstance`, `:825`) | inline, hand-appended to snapshot/save | `save` (baseline descriptor) | per-instance stat maps |
| `cosmetics` (`:674`) | descriptor, **no save** | `save` | equipped skins lost on restore today |
| `cards` (`:785`) | descriptor, **no save** | `save` | pile contents/order |
| `turn` (`:792`) | descriptor, **no save**, `loop` timers | `tick`, `save` | turn/phase counters + timer advance |
| `race` (`:799`) | descriptor, **no save** | `tick`, `save` | race progress/positions |
| `motion` (`createMotionIntents`, `:1616`) | inline | `tick`, `dispose` | per-frame intent integration |
| `pose` (`createPoseState`, `:993`) | inline, no save | `save` | pose + constraints |
| `possession` (`createPossession`, `:1013`) | inline, no save — **the #14 gap** | `save`, `replicate` | ownership must replicate to clients and survive restore |
| baseline (`entities`, `store`, `feed`, `inventory`, `economy`) | hand-written module arrays | `save`/`replicate` via baseline descriptors | membership stops being a hand-maintained list |

## Consequences

Positive:

- One written owner of tick (`GameLoop.onTick`), one written owner of a subsystem's lifecycle (its descriptor). The "which model ticks?" ambiguity is closed.
- Adding a subsystem is one descriptor registration carrying its own tick/save/replicate/dispose — never a new inline `createX()` plus edits to three module arrays plus a dispose call. Extends #11's seam instead of fighting it.
- #14 (per-descriptor save/restore) reduces to filling in the `save` column of the table above; no new mechanism.
- Save/replication gaps become structurally visible: a subsystem with mutable state and no `save` is a reviewable omission on one object, not a silent gap between two distant arrays.
- The `Behaviour` world can no longer silently diverge from the authority — its update is clock-driven and render-scoped.

Costs / follow-ups:

- Migrating the six inline subsystems (`time`, `stats`, `pose`, `possession`, `motion`, and the baseline five) into descriptors touches `createGameContext`'s assembly and must keep `ctx.snapshot()`/`ctx.game.save` byte-identical for existing games — covered by `gameContextSave.test.ts` / `worldReplication.test.ts` / `worldSnapshot.test.ts`.
- `FeatureDescriptor.key` widening to `FeatureKey` (beyond `keyof GameFeatures`) needs a small internal-key union so baseline descriptors have stable keys.
- `Behaviour` game-logic misuse must be audited game-by-game before its update loop is reparented; extraction must not change how any shipped game plays.
- `tick` ordering is registration order; a subsystem that depends on another advancing first (e.g. `motion` after `time`) relies on descriptor list order — documented, not enforced by types.
