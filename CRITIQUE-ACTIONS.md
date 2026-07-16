# Critique → actions

Actionable work from the 2026-07 JGengine critique. **This file is the backlog.**  
Surface-diet work that already shipped lives under [CUTLIST.md](CUTLIST.md) (orphans 1411→362, core root diet, gallery defaults). Do not open a second parallel plan for the same item — update status here.

**How to work:** pick the next open `P0`/`P1` row, one branch/PR (or stack on an open cut PR), mark status when done. Owner decisions stay parked until decided.

| Status | Meaning |
| --- | --- |
| ✅ | Done on tree / PR |
| 🔨 | In progress this session |
| ⏸ | Blocked on owner decision or deliberate defer |
| ☐ | Open |

---

## Scoreboard (re-measure when a row lands)

| Signal | At critique | Now | Target |
| --- | --- | --- | --- |
| Orphan baseline | 1411 | **362** | keep &lt; 400; drive toward &lt; 250 |
| API doc debt | ~3476 | ~2679 | downward only |
| Tracked games w/ source | 10 / ~61 dirs | **10** (empty dirs purged) | honest count only |
| Core package root | host runtime barrel | VERSION/CHANGELOG only | keep |
| `GamePlayerShell.tsx` lines | ~2526 | **~boundActionDispatch extracted** | &lt; 800 composition root |
| `gameContext.ts` lines | ~1763 | ~1763 | split by domain over time |
| Version lockstep claim | false (CLI 0.8.5, github 0.1.0) | **docs honest** (SDK set vs CLI/github) | keep honest or realign versions |
| Keywords claim ECS | yes | **removed** | no false ECS marketing |

---

## P0 — Product honesty

| ID | Action | Done looks like | Status |
| --- | --- | --- | --- |
| H1 | **Stop claiming ECS** | No `"ecs"` keyword; README/package copy says entity stores + catalogs + commands, not ECS | ✅ |
| H2 | **Version story is true** | Docs list which packages lockstep at 0.10.x; CLI `jgengine` + `@jgengine/github` called out as separate cadence **or** versions aligned on purpose | ✅ (docs) |
| H3 | **AGPL is owned or changed** | README “Who this license fits” blurb (agent/OSS first; commercial needs dual-license conversation) **or** owner flips license | ✅ (doc) |
| H4 | **Gallery honesty** | Only real games in defaults/docs; empty `Games/*` gone | ✅ CUTLIST |
| H5 | **Core root is not a second API** | Package root = version/changelog; deep paths for engine | ✅ CUTLIST |
| H6 | **Orphan gate is honest** | Cross-package `packages/*` adoption counts; pure helpers `@internal` | ✅ CUTLIST |

---

## P1 — One mental model (runtime + multiplayer)

| ID | Action | Done looks like | Status |
| --- | --- | --- | --- |
| R1 | **Game-facing sim = `GameContext` only** | Main skill / README onboarding never lead with `createGameRuntime`; host skill labels it host plumbing | ✅ |
| R2 | **Dual-runtime map in multiplayer skill** | One short table: client loop vs host `GameRuntime` rows/snapshots; when each is used | ✅ |
| R3 | **Authority language** | Docs + API comments: unset/`"client"` = **presence-only** (each client ticks); `"server"` = host-authoritative world. Helper name or JSDoc makes that unmissable | ✅ `resolveAuthority` / `isPresenceOnly` |
| R4 | **Do not flip default to server without migration** | Any default change ships with migrate note + game audit | ⏸ deliberate |
| R5 | **Flagship hosted demo path** | One real tracked game + example host documented end-to-end (no missing `voxel-mine`) | ☐ |

---

## P1 — Surface & modularity

| ID | Action | Done looks like | Status |
| --- | --- | --- | --- |
| S1 | **Keep orphan baseline &lt; 400** | `scripts/cutlistSurface.test.ts` + gate | ✅ |
| S2 | **`@internal` pure helpers** | Math/host plumbing off skill `api.md` | ✅ CUTLIST |
| S3 | **Demote unadopted genre factories** | sensor/tactics/board/… internal or taught | ✅ CUTLIST |
| S4 | **Slim package barrels** | shell `camera` public surface small; no math re-export dump | ✅ CUTLIST |
| S5 | **Router skill stays thin** | Main `jgengine` skill = intake + routing; no novel-length API dump growth | ☐ (watch; trim if regrows) |
| S6 | **Tooling off skill orphan surface** | CLI + github not in skill routing | ✅ CUTLIST |

---

## P2 — God objects & shell

| ID | Action | Done looks like | Status |
| --- | --- | --- | --- |
| G1 | **Extract shell composition seams** | First extract: pure helpers / submodules already separate; next: move one concern out of `GamePlayerShell.tsx` (input dispatch **or** audio wire **or** net sink) into named module, shell imports it | ✅ `boundActionDispatch.ts` |
| G2 | **Plugin-shaped shell long-term** | Movement / Input / Audio / Net / Presentation plugins; entry &lt; 400 lines | ⏸ after G1 proves pattern |
| G3 | **`createGameContext` domain factories** | No big-bang rewrite; new subsystems attach via factories, not more lines in the god file when avoidable | ☐ ongoing rule |

---

## P2 — Types & catalogs

| ID | Action | Done looks like | Status |
| --- | --- | --- | --- |
| T1 | **Typed catalogs over `meta` casts** | At least one path: branded catalog id **or** typed `meta` helper used by a real game | ☐ |
| T2 | **Prefer `defineStore` in skills/examples** | No new skill examples with raw `store.get as T` | ☐ |
| T3 | **Retire deprecated `GameDefinition.scene`** | Removed in next major; until then skill says use `ctx.scene.entity` | ☐ |

---

## P2 — Physics & scale

| ID | Action | Done looks like | Status |
| --- | --- | --- | --- |
| Y1 | **Physics strategy written** | Short ADR in this file or `packages/core/src/physics/README.md`: custom SoA stays; Rapier considered only if a flagship needs rotation-rich vehicles/ragdoll | ✅ |
| Y2 | **Character controller vs PhysicsWorld** | Skill note: walk controller ≠ PhysicsWorld; bind via `bodyBind` when both used | ☐ |
| Y3 | **Hot-path scale defaults** | Spatial invalidation / LOD documented where swarms exist; no new unbounded per-frame scans in core hot paths | ☐ ongoing |

---

## P3 — Process & agent ops

| ID | Action | Done looks like | Status |
| --- | --- | --- | --- |
| O1 | **Windows gates work** | `scripts/guard.ts` spawns without `sh` | ✅ CUTLIST |
| O2 | **Fan-out stays cost-positive** | No change this track; papercuts stay the feedback loop | ☐ |
| O3 | **One PR per task; no mid-task merge theater** | Stack critique work; user merges | ✅ practice |

---

## P3 — Identity & copy

| ID | Action | Done looks like | Status |
| --- | --- | --- | --- |
| C1 | **Product sentence** | README lead: agent-native game **framework/SDK** (entity stores, commands, shell) — not “ECS engine” | ✅ |
| C2 | **Genre-agnostic vs genre-complete** | Design note: opt-in `features` keep *runtime* lean; package still ships many domains — OK if skills route selectively | ✅ README |

---

## Explicit non-goals (this backlog)

- Deleting the 10 real games  
- Kenney assets (repo ban)  
- Forced AGPL → MIT without owner  
- Full ECS rewrite  
- Full dual-runtime deletion while hosts depend on `createGameRuntime`  

---

## Execution order (default)

```
H1 H2 H3 C1 C2   → honesty (this pass)
R1 R2 R3         → multiplayer mental model
Y1               → physics ADR
G1               → first shell extract
R5 T1 G2         → next sessions
```

Update the scoreboard and row status in the same PR as the work.
