# 0002 — Thin `gameContext.ts` by mechanical extraction first; `systems`/`defineSystem` (#842) is a separate, human-greenlit phase

- Status: Accepted
- Date: 2026-07-16
- Deciders: engine
- Informs: ADR 0001 (descriptor lifecycle ownership), #842 (composable systems), critique item #11

## Context

`packages/core/src/runtime/gameContext.ts` was ~2043 lines. Critique item #11 named it the top architectural smell; the shipped fix delivered the `FeatureDescriptor` seam (opt-in features register as data, not `features.x ?` branches) but left the file thick: the 13-entry descriptor array lived inline (~283 lines), and `createGameContext` (~1150 lines) still hand-built every always-on subsystem and hand-maintained the `snapshotModules`/`saveModules` arrays that ADR 0001 §2 said should fall out of one descriptor pass.

Two candidate paths were on the table:

1. **Mechanical extraction (internal only).** Move descriptor bodies into `runtime/descriptors/*`, convert the always-on baseline subsystems into always-on descriptors per ADR 0001, collapse `createGameContext` toward the loop. No public API change; `defineGame`, `loop.ts`, and every game in `Games/*` untouched.
2. **Full #842.** A public `systems: [...]` / `defineSystem()` authoring model with per-system scheduling (fixed/frame/interval/event), stage ordering, and per-system lifecycle. Changes the public `defineGame` shape and migrates all ~10 games off manual `tickX(ctx)` fan-out.

## Decision

**Do path 1 now, phased; treat #842 as a follow-on that builds on path 1's substrate and starts only on explicit human greenlight.** They are sequential, not alternatives — path 1 is a prerequisite of #842, not a dead end.

Why this order, against the repo's own principles:

- **"Extracting SDK primitives must not change how a game plays."** Path 1 is provably behavior-preserving: same modules, same keys, same order, proven by the existing `gameContext*.test.ts` / `worldSnapshot` / `worldReplication` suites and `test:all`. Path 2 cannot make that promise — per-system scheduling (fixed-rate accumulators, interval timers, stage reordering) changes *when* code runs, which is gameplay-visible in every real game. That demands per-game migration + visual verification, i.e. user-owned scope.
- **Extend through seams, never edits.** The descriptor contract *is* the seam #842's `defineSystem` needs: #842's acceptance criteria ("systems own save, replication, reset and disposal") are exactly ADR 0001's `FeatureInstance` fields. Finishing descriptor ownership first means `defineSystem` becomes a public face over an existing internal contract instead of a second parallel lifecycle model — avoiding the "two authoring paths" flaw #842 itself warns about (its cartridge critique).
- **Blast radius / one PR per task.** Path 1 is one internal PR gated by existing tests. Path 2 touches the public API, all games, skills, docs, and the orphan/content gates — un-shippable as a single safe PR and explicitly the kind of scope a human greenlights (#842 is the owner's issue; its API sketch needs their sign-off).
- **Build for the next ten games.** Nothing in path 1 forecloses path 2; every line moved is a line #842 doesn't have to re-read inside a 2000-line closure.

### Path 1 phases (each independently shippable, behavior-identical)

1. **Descriptor relocation + baseline serialization ownership** *(this PR)*:
   - `runtime/descriptors/features.ts` — the `FeatureDeps`/`FeatureBuild`/`FeatureDescriptor` contract and the 13 opt-in descriptors, moved verbatim.
   - `runtime/descriptors/baseline.ts` — new `BaselineDescriptor` list owning the serialization of the always-on subsystems: `entities`/`stats`/`store`/`feed`/`inventory` (replicate + save) and `economy`/`time`/`pose`/`possession`/`motion` (save-only). `createGameContext` composes `snapshotModules`/`saveModules` from one pass over this list — membership is no longer two hand-maintained arrays. Descriptor order fixes snapshot key order and is load-bearing.
2. **Baseline construction moves behind `create(deps)`** — each baseline descriptor also *builds* its subsystem (today `createGameContext` still calls `createSimClock`, `createPoseState`, … inline), pulling `FeatureDeps`/`BaselineDeps` together per ADR 0001 §2's widened `FeatureKey`.
3. **Facade assembly extraction** *(this PR, first cut)* — cohesive inline clusters move to `runtime/context/*` builders: `combatFx.ts` (float text, VFX, telegraphs, hit reactions, effect-with-float wrapper), `worldItems.ts` (ground-item store + spawn/pickup verbs), `registries.ts` (card piles, turn loops, race states). Remaining inline clusters (effects/death/projectile construction, spawn/despawn helpers, loadouts, the `ctx` literal) follow the same pattern in later cuts; `createGameContext` approaches the ADR target: deps + one descriptor loop + the `ctx` literal.
4. **`tick`/`dispose` on the descriptor contract** (ADR 0001's `FeatureInstance`) — the last substrate piece #842 needs.

### Sequencing #842

After phase 4, `defineSystem()` is largely a rename-plus-schedule layer: public `SystemDescriptor` ≈ internal descriptor + `tick` policy. Ship it as: (a) engine-side scheduling compiled from system declarations, (b) `systems: []` accepted alongside existing hooks (additive — `onTick` keeps working), (c) per-game incremental migration, one game per PR, judged by eye per the visual bar. No cross-game migration starts unprompted.

## Consequences

- `gameContext.ts` drops ~2043 → ~1404 lines across phases 1 and 3's first cut, with zero public-API or behavioral delta; later cuts continue toward "deps + loop + ctx literal".
- Save/replication membership is now structurally owned (ADR 0001 §2 realized for serialization); a new baseline subsystem registers one descriptor instead of editing two distant arrays.
- Snapshot key order is pinned by descriptor order — reordering `baselineDescriptors` would reorder save payload keys; documented on the list, not enforced by types.
- Type-only imports from `descriptors/features.ts` back into `gameContext.ts` create a type-level cycle (no runtime cycle); acceptable, dissolves in phase 3 when the `GameContext*` interface types move to their own module.
- #842 remains open and unblocked; its issue tracks the public authoring model, this ADR owns the internal substrate sequencing.
