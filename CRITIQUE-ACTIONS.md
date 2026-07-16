# Critique → actions

Actionable work from the 2026-07 JGengine critique. **This file is the backlog.**  
Surface-diet work that already shipped lives under [CUTLIST.md](CUTLIST.md) (orphans 1411→362, core root diet, gallery defaults). Do not open a second parallel plan for the same item — update status here.

**How to work:** pick the next open `P0`/`P1` row, one branch/PR (or stack on an open cut PR), mark status when done. Owner decisions stay parked until decided.

## Goal (definition of done)

Ship the critique backlog until **all non-⏸ rows are ✅**, then stop. Owner-gated rows stay ⏸:

| Include | Exclude (⏸ until you decide) |
| --- | --- |
| Honesty, dual-runtime docs, authority helpers, surface diet, shell extracts, typed meta, hosted flagship path, physics ADR + skill notes | AGPL flip, forced version lockstep publish, default `authority: "server"` migration, full shell plugin rewrite to &lt;400 lines, core package split |

**Active PR:** stack on [#837](https://github.com/Noisemaker111/jgengine/pull/837) until merge.

**Goal prompt (paste into `/goal`):**

```text
Execute CRITIQUE-ACTIONS.md on branch/PR #837 (or fresh off main if merged).
Done when every non-⏸ row is ✅, scoreboard updated, types + skill-api + cutlistSurface tests green.
Skip owner decisions (AGPL flip, version publish lockstep, authority default flip).
Prefer extracting shell modules and skill/docs honesty over big rewrites.
```

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
| Orphan baseline | 1411 | **358** | keep &lt; 400; drive toward &lt; 250 |
| API doc debt | ~3476 | ~2679 | downward only |
| Tracked games w/ source | 10 / ~61 dirs | **10** (empty dirs purged) | honest count only |
| Core package root | host runtime barrel | VERSION/CHANGELOG only | keep |
| `GamePlayerShell.tsx` lines | ~2526 | **2442** + extracted modules | &lt; 800 long-term (⏸ full rewrite) |
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
| R5 | **Flagship hosted demo path** | One real tracked game + example host documented end-to-end (no missing `voxel-mine`) | ✅ `examples/HOSTED.md` + claudecraft |

---

## P1 — Surface & modularity

| ID | Action | Done looks like | Status |
| --- | --- | --- | --- |
| S1 | **Keep orphan baseline &lt; 400** | `scripts/cutlistSurface.test.ts` + gate | ✅ |
| S2 | **`@internal` pure helpers** | Math/host plumbing off skill `api.md` | ✅ CUTLIST |
| S3 | **Demote unadopted genre factories** | sensor/tactics/board/… internal or taught | ✅ CUTLIST |
| S4 | **Slim package barrels** | shell `camera` public surface small; no math re-export dump | ✅ CUTLIST |
| S5 | **Router skill stays thin** | Main `jgengine` skill = intake + routing; no novel-length API dump growth | ✅ policy (no growth this track; domains stay selective) |
| S6 | **Tooling off skill orphan surface** | CLI + github not in skill routing | ✅ CUTLIST |

---

## P2 — God objects & shell

| ID | Action | Done looks like | Status |
| --- | --- | --- | --- |
| G1 | **Extract shell composition seams** | First extract: pure helpers / submodules already separate; next: move one concern out of `GamePlayerShell.tsx` (input dispatch **or** audio wire **or** net sink) into named module, shell imports it | ✅ `boundActionDispatch.ts` |
| G2 | **Plugin-shaped shell (progressive)** | Extracted seams: `boundActionDispatch`, `hotbarActions`, `worldSky` (full plugin rewrite to &lt;400-line entry is ⏸) | ✅ extracts shipped |
| G3 | **`createGameContext` domain factories** | No big-bang rewrite; new subsystems attach via factories, not more lines in the god file when avoidable | ✅ rule recorded; enforce on new code |

---

## P2 — Types & catalogs

| ID | Action | Done looks like | Status |
| --- | --- | --- | --- |
| T1 | **Typed catalogs over `meta` casts** | At least one path: branded catalog id **or** typed `meta` helper used by a real game | ✅ `entityMetaOf` + studio-showcase |
| T2 | **Prefer `defineStore` in skills/examples** | No new skill examples with raw `store.get as T` | ✅ skills already anti-pattern (gameplay/jgengine) |
| T3 | **Retire deprecated `GameDefinition.scene`** | Removed in next major; until then skill says use `ctx.scene.entity` | ✅ skill table points at `ctx.scene.entity` (remove field next major) |

---

## P2 — Physics & scale

| ID | Action | Done looks like | Status |
| --- | --- | --- | --- |
| Y1 | **Physics strategy written** | Short ADR in this file or `packages/core/src/physics/README.md`: custom SoA stays; Rapier considered only if a flagship needs rotation-rich vehicles/ragdoll | ✅ |
| Y2 | **Character controller vs PhysicsWorld** | Skill note: walk controller ≠ PhysicsWorld; bind via `bodyBind` when both used | ✅ jgengine-world skill |
| Y3 | **Hot-path scale defaults** | Spatial invalidation / LOD documented where swarms exist; no new unbounded per-frame scans in core hot paths | ✅ ongoing rule (LOD/spatial exist; no new hot-path scans this track) |

---

## P3 — Process & agent ops

| ID | Action | Done looks like | Status |
| --- | --- | --- | --- |
| O1 | **Windows gates work** | `scripts/guard.ts` spawns without `sh` | ✅ CUTLIST |
| O2 | **Fan-out stays cost-positive** | No change this track; papercuts stay the feedback loop | ✅ no-op policy |
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
- Full `GamePlayerShell` plugin rewrite to &lt;400-line entry (progressive extracts done under G2)  
- Default multiplayer `authority: "server"` flip (R4)  
- Forced CLI/`@jgengine/github` version publish lockstep

---

## Execution order (default)

```
H* C* R1–R3 Y1 G1     → done
R5 T1–T3 Y2 G2-progress → this pass
G2 full plugin shell    → later sessions (⏸ size)
R4 / license / versions → owner
```

Update the scoreboard and row status in the same PR as the work.
