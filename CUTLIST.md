# Surface cut list

Concrete diet plan after the 2026-07 engine critique. **One PR stacks all batches** — no mid-goal merges.

**Metrics (main @ 0.10.0 kickoff → stacked cuts):**

| Metric | Kickoff | Now |
| --- | --- | --- |
| Orphan baseline | 1411 | **362** (−1049) ✅ under 400 |
| API doc debt baseline | ~3476 | **2679** (−797) |
| Tracked games with source | 10 | 10 |
| Local empty `Games/*` | ~51 | **0** |
| Core package root | host runtime barrel | **VERSION/CHANGELOG only** |

**Success bar:** orphan count **&lt; 400** ✅ (362), core barrel not a second API ✅, zero missing-game refs ✅.

---

## Batch 1 — honesty + orphan accuracy ✅

| # | Cut | Done |
| --- | --- | --- |
| 1.1 | `packages/*` adoption in orphan gate | ✅ |
| 1.2 | Core root barrel → VERSION/CHANGELOG | ✅ |
| 1.3 | Desktop/README `voxel-mine` → `studio-showcase` | ✅ |
| 1.4 | Purge empty local `Games/*` | ✅ |
| 1.5 | Re-seed baselines | ✅ |
| 1.6 | Windows `guard.ts` | ✅ |
| 1.7 | `packGltfToGlb` `@internal` | ✅ |

## Batch 2 — `@internal` pure helpers ✅

Shell camera/terrain/weather math, core devtools, host runtime plumbing, editor document helpers, pure math (`anim`, `vec2`, `geometry`, visibility bounds…). Tool: `scripts/mark-internal.ts` (idempotent, re-runnable).

## Batch 3 — demote unadopted genre packs ✅

`@internal` on factories in `sensor/*`, `tactics/*`, `board/*`, `session/*` (except kept-usable `ring`), niche multiplayer (`lagCompensation`, `simultaneousCommit`, `combatSnapshot`, `presenceModel`), unused `ai/*` helpers. Still importable deep-path; off skill `api.md` + orphan gate.

Also internal'd under-taught packs: puzzle, crop, dash, walls, beatClock, slotModel, shapedGrid, sharedWallet, techTree, CLI/github/assets download helpers.

## Batch 4 — dual runtime (docs only) ✅ light

- README sample uses `createGameContext`, not `createGameRuntime`
- Multiplayer skill: `createGameRuntime` labeled host plumbing only
- Full code collapse (delete dual model) **deferred** — hosts still need the factory

## Batch 5 — shell god-object split ⏸ deferred

`GamePlayerShell` split is multi-day behavior risk; not stacked here. Revisit after merge when orphans &lt; 400.

## Batch 6 — gallery honesty ✅

- Dead `voxel-mine` defaults/docs/examples rewritten to `studio-showcase` / `my-game`
- Empty game dirs purged locally

## Batch 7 — license + version ⏸ owner decision

AGPL stay vs dual-license; CLI 0.8.5 / github 0.1.0 lockstep (publish side-effect).

## Batch 8 — package split ⏸ after orphans &lt; 400

---

## How to push further (same PR or follow-up)

```sh
# add paths to FILES in scripts/mark-internal.ts, then:
bun scripts/mark-internal.ts
bun run gen:skill-api
```

Next high-ROI orphan buckets: `@jgengine/react` (126), shell camera components (keep public — teach in skill), `@jgengine/convex` barrel re-exports.
