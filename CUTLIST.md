# Surface cut list

Concrete diet plan after the 2026-07 engine critique. Goal: fewer public symbols, honest gallery, one mental model for agents. Ship as sequential PRs (one batch each). Do not version-bump to force publish unless asked.

**Metrics at kickoff (main @ 0.10.0) → after Batch 1:**

| Metric | Before | After Batch 1 |
| --- | --- | --- |
| Orphan baseline | 1411 | **1214** (−197) |
| API doc debt baseline | ~3476 | **3409** (−67) |
| Tracked games with source | 10 | 10 |
| Local empty `Games/*` dirs | ~51 | **0** (purged) |
| Core package root | host runtime barrel | **VERSION/CHANGELOG only** |

**Success bar for the full goal:** orphan count **&lt; 400**, core barrel not a second API, zero references to missing games, CUTLIST batches 2–6 filed or shipped.

---

## Batch 1 — honesty + orphan accuracy (this PR)

**Intent:** stop lying about surface adoption and dead sample games; cut false orphans.

| # | Cut | How | Risk |
| --- | --- | --- | --- |
| 1.1 | Orphan gate false positives | Count `packages/*` consumers (non-test) as adoption in `scripts/apiAdoption.ts` — host APIs used only by `ws`/`shell` are not product orphans | Low — gate still fails new unused exports |
| 1.2 | Core package root barrel | `packages/core/src/index.ts` exports only `VERSION`/`CHANGELOG` from `meta/changelog` — deep paths only for engine APIs | Low — monorepo already uses deep paths only |
| 1.3 | Dead default game | Desktop + README stop defaulting to missing `voxel-mine` → `studio-showcase` | Low |
| 1.4 | Local empty `Games/*` | Delete untracked dirs that have no git files (node_modules only) | Local only |
| 1.5 | Re-seed orphan/doc baselines | `bun run gen:skill-api` after adoption fix; commit pruned baselines | Low |
| 1.6 | Windows `guard.ts` | Spawn via `shell: true` + `taskkill` on win32 — `sh` was ENOENT and blocked every gate | Low |
| 1.7 | `packGltfToGlb` | Mark `@internal` (download-only helper; new orphan after re-scan) | Low |

**Out of batch:** version lockstep (CLI 0.8.5 / github 0.1.0) — publish side-effect; needs explicit release decision.

---

## Batch 2 — `@internal` pure helpers (~200–400 orphans)

Mark function/class exports that are pure math / host plumbing / test seams with `@internal` so they leave skill `api.md` and the orphan gate.

| Domain | Examples | Keep public |
| --- | --- | --- |
| `shell/camera/*Math*` | blend/orbit/inspection/rig math | `cameraShake`, rig config types, `GameCameraRig` entry |
| `core/devtools/*` | path escape, color parse, rewrite internals | `devtools`, `tunable`, discovery plugin |
| `core/runtime/hostPersistence` | row key helpers, trim, clamp | types + the host entrypoints packages call |
| `core/runtime/snapshot` | dirty flags, empty rows | types used by hosts |
| `core/editor/document` | find/merge helpers if only editor package uses them | document load/save API games/editor MCP need |
| `shell/terrain/*Material*`, weather math | shader/math helpers | `ProceduralGround`, `WeatherLayer` |

**Acceptance:** orphan baseline drops by ≥200; no game import breaks (`check-types` + `test:all`).

---

## Batch 3 — demote unadopted genre packs

Either delete, move to `examples/experimental`, or `@internal` entire modules with **zero** game + **zero** skill prose (not just api.md) after Batch 1–2.

Priority kill/demote list (re-verify with adoption after Batch 1):

1. `core/sensor/*` beyond one showcase (concealment, freezeMonitor) if still unused  
2. `core/session/*` BR/extraction stack if no flagship uses it  
3. `core/multiplayer/lagCompensation`, `simultaneousCommit`, `combatSnapshot` if no host demo  
4. `core/tactics/*` + `core/board/*` if only theoretical  
5. `core/ai/crowd`, `jobBoard` if unused  
6. Duplicate turn intent exports / dead dual modules  

**Rule:** no module stays public “for the next game” without a skill paragraph **and** either a game use or a `@capability` + example in skill body.

**Acceptance:** orphan &lt; 700; skill router tables shrink or gain real examples.

---

## Batch 4 — dual runtime collapse (design PR then code)

| Now | Target |
| --- | --- |
| `createGameContext` + shell tick | **The** game sim API |
| `createGameRuntime` + player/chunk rows | Host adapter only — not taught in main skill concept table |
| World mirror / snapshot bridge | One documented path under `jgengine-multiplayer` |

Cuts:

- Remove `createGameRuntime` from main skill concept→import table  
- Host packages own the row/snapshot vocabulary  
- Prefer `ctx.snapshot()` / `ctx.hydrate()` as the only game-facing persistence/replication shape  
- Deprecate leftover `GameDefinition.scene` entity store field (already deprecated) — delete in next major  

**Acceptance:** one onboarding story; host README points at adapter package, not core index.

---

## Batch 5 — shell god-object split

`GamePlayerShell.tsx` (~2500 lines) → composition root + plugins:

| Plugin | Owns |
| --- | --- |
| `MovementPlugin` | walk controller, motion drain |
| `InputPlugin` | bindings, command fire, prompts |
| `AudioPlugin` | catalogs → emitters |
| `NetPlugin` | world sync, sinks |
| `PresentationPlugin` | canvas, camera, culling, postfx |

**Acceptance:** shell entry &lt; 400 lines; plugins testable in isolation; no behavior change in studio-showcase / tower-guard.

---

## Batch 6 — gallery + product honesty

| Cut | Action |
| --- | --- |
| Empty `Games/*` | Never re-scaffold empty dirs; smoke only real packages |
| `CLASSICS.md` | Keep as roadmap only; status column stays honest (already mostly ❌) |
| Docs/examples | Drop or rewrite `Games/voxel-mine` references to a real multiplayer sample |
| Website claims | Count = tracked games with `package.json`, not directory count |
| Flagships | Two polished multiplayer demos (offline + hosted) linked from site — not 60 stubs |

---

## Batch 7 — license + version policy (decision, not drive-by)

| Decision | Options |
| --- | --- |
| License | Stay AGPL (own it in README) **or** dual-license / MIT for SDK packages |
| Lockstep | Bump `jgengine` CLI + `@jgengine/github` to match 0.10.x **or** stop claiming “eight packages lockstep” |
| Publish | User-owned; cut PRs must not silent-bump for release |

---

## Batch 8 — package split (only after orphans &lt; 400)

Optional physical split of `@jgengine/core` (import paths can re-export for one major):

| Package | Contents |
| --- | --- |
| `core` | defineGame, gameContext, scene, store, input, runtime contracts |
| `core-combat` | effects, projectiles, death, abilities |
| `core-world` | terrain, scatter, terraform, nav |
| `core-session` | ring, extraction, rounds, matchmaking helpers |

Prefer **thin public surface** over many packages if agents pay path tax.

---

## Non-goals (explicit)

- Rewriting physics to Rapier in cut PRs (strategy note only; separate project)  
- Mass game content deletion of the 10 real games  
- Rewriting CLAUDE.md process / fan-out (ops, not surface)  
- AGPL flip without owner decision  

---

## Execution order

```
Batch 1 (ship) → Batch 2 → Batch 3
                 ↘ Batch 4 (design then code)
Batch 5 after 2 (shell math internal first)
Batch 6 anytime after 1
Batch 7 owner decision
Batch 8 last
```

Each batch = one branch off `origin/main`, one PR, no merge by agents.
