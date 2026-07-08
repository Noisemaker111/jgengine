---
name: jgengine-archetype-testbed
description: Use when the user wants to find engine extensibility gaps, stress-test JGengine against game archetypes, discover missing primitives before building a game, audit whether the engine supports a genre, or research what systems a named game would need and whether JGengine exposes them. Triggers include "will JGengine support X", "can we build Y", "find engine pain points", "test extensibility", "what games can this engine make", "archetype audit", "engine gap analysis", "does the engine have", "the shell hardcodes", "game mode needs".
---

# JGengine — Archetype Testbed & Extensibility Audit

The deliverable is a **pain point list** — every place a named game archetype needs a system JGengine does not expose, or where the shell hardcodes a choice that should be game-configurable. This skill runs *ahead* of real game builds so gaps are found in hours, not discovered two hours into a project.

**Leading words:** _archetype_ (a canonical game pattern), _testbed_ (a minimal mechanical probe), _pain point_ (a blocked extensibility gap), _primitive_ (an engine-owned building block).

## Read first

| Skill | Why |
|-------|-----|
| `jgengine-api` | The engine surface — what primitives exist today |
| `jgengine-newgame` | How games plug in — `PlayableGame`, `defineGame`, shell contracts |

## What counts as a pain point

A pain point is **anywhere a game archetype needs behavior the engine prevents or ignores**, not merely things the engine doesn't ship pre-built. The test: *can a game express this through `PlayableGame` + `defineGame` + `GameContext` without forking `@jgengine/shell`?*

| Pain point class | Examples |
|------------------|----------|
| **Shell hardcode** | `enablePan={false}`, middle-mouse bound to dolly, orbit locked to player entity, WASD-only movement, primary-click = ability only |
| **Missing primitive** | No pathfinding API, no drag-select, no box select, no click-to-move, no building rotation, no dialogue tree state machine, no grid-snap placement rules |
| **Config gap** | Camera has no `followTarget` mutation, no `movementMode: "game"`, no `onPrimaryClick` hook, no `mouseBindings` map |
| **Renderer mismatch** | Genre needs 2D sprite batching, side-scrolling follow camera, isometric projection, split-screen — shell assumes 3D orbit or first-person |
| **Lifecycle gap** | No save-scoped state for puzzles, no level transition primitive, no rewind/replay, no ghost data |

A missing primitive that two or more archetypes need is an **engine gap** — file it as an issue or PR against `@jgengine/core` or `@jgengine/shell`. A one-archetype need is a **recipe** (documented workaround) until a second game needs it.

## Archetype — what it is

An _archetype_ is a canonical game pattern with a known mechanical fingerprint: camera mode, input scheme, movement model, core loop, win/lose condition, and UI topology. It is **not** a full game design — it is the minimal set of systems that must exist for the archetype to be recognizable.

Examples: _flappy_ (impulse + gravity + scroll), _tower-defense_ (lanes + towers + waves + economy), _life-sim_ (needs + time + furniture + social graph), _bullet-heaven_ (auto-attack + swarm + upgrade tree).

## The process

### Step 1 — Engine inventory (always)

Read the current engine surface before inventing archetypes. Read `jgengine-api` fully, then probe these files directly:

- `packages/core/src/game/playableGame.ts` — `PlayableGame`, `GameCameraConfig`
- `packages/shell/src/camera/GameOrbitCamera.tsx` — hardcoded camera behavior
- `packages/shell/src/GamePlayerShell.tsx` — input handling, movement, primary click
- `packages/core/src/input/actionBindings.ts` — what input the engine captures
- `packages/core/src/world/features.ts` — world primitives
- `packages/core/src/game/defineGame.ts` — `defineGame` surface
- `packages/assets/src/sources/kenney.ts` and `quaternius.ts` — asset pack coverage

**Completion criterion:** You can list every `PlayableGame` field, every `GameCameraConfig` property, every reserved input action, and every world feature without re-reading the files.

### Step 2 — Archetype brainstorm

Produce a list of **20+ archetypes** spanning genres, camera modes, input schemes, and loop types. Each entry names the archetype in one or two words and tags its mechanical family.

**Do not stop at 20** if more come easily — the goal is breadth, not a quota. Mix classic Flash-era games (the user's examples: Flappy Bird, Learn to Fly, Bloons TD), modern indies, mobile genres, and AAA patterns.

**Completion criterion:** A flat list of 20+ archetypes with one-line mechanical tags, written to `GAME_ARCHETYPES.md` under the `# Archetype catalog` heading. The list mixes 2D and 3D, clicker and controller, synchronous and turn-based.

### Step 3 — Mechanical decomposition (per archetype)

For each archetype, decompose into **subsystems** — the verbs and nouns the game actually needs. Use these categories:

| Category | Questions |
|----------|-----------|
| **Camera** | Perspective (2D/3D, orthographic/perspective, follow/fixed/scroll)? Player-attached or free? Pan/zoom/rotate controls? Split-screen? Cutscene support? |
| **Input** | Pointer, keyboard, gamepad, gesture? Tap, drag, hold, swipe, multi-touch? Contextual vs mode-locked? |
| **Movement** | Physics-driven or direct set? Grid or free? Continuous or turn-based? Pathfinding? Vehicles? |
| **Core loop** | Real-time tick, turn-based, event-driven, idle/AFK? Win/lose/trigger conditions? |
| **World** | Procedural, handcrafted, tilemap, voxel, free-placement? Interior/exterior? Zoning? |
| **Entities** | How many? Persistent or spawned? AI behavior complexity? Dialogue? |
| **Economy** | Currency, resources, crafting, trading, stock market? |
| **Progression** | XP, levels, unlocks, achievements, skill trees, gear? |
| **UI** | HUD density, modal panels, minimap, radial menus, drag-and-drop? |
| **Multiplayer** | Couch co-op, online, async, leaderboards? |
| **Save/load** | Checkpoint, continuous, scoped state, rewind? |

**Completion criterion:** Every archetype in the catalog has a subsystem breakdown. The breakdown is shallow for simple archetypes (Flappy Bird needs 3 subsystems) and deep for complex ones (Civilization needs 10+).

### Step 4 — Extensibility check (per subsystem)

For each subsystem, ask the **extensibility question:**

> Can a game implement this subsystem using only `PlayableGame`, `defineGame`, `GameContext`, and the shell — no fork of `@jgengine/shell`, no raw three.js in game code, no monkey-patching `GamePlayerShell`?

If the answer is **no**, it is a **pain point**. Record:
- The exact subsystem that is blocked
- The engine surface that *should* expose it (new `PlayableGame` field, new `GameCameraConfig` property, new `GameContext` API, new shell prop)
- Whether the block is a **shell hardcode**, **missing primitive**, or **config gap**
- A **severity** (`blocked` = cannot build the archetype without engine change; `workaround` = can hack around it; `friction` = possible but ugly)

**Completion criterion:** Every archetype has a pain point list, or an explicit "no gaps found" note. `blocked` items are flagged for issue filing.

### Step 5 — Batch dispatch (subagents)

Run archetypes through subagents **2 at a time**, in parallel. Each subagent receives:
- The two archetype names and their subsystem breakdowns
- The current engine inventory (summarize `PlayableGame` fields, camera config, input actions, world features)
- The extensibility check questions

**Subagent prompt template:**

```
You are an engine extensibility auditor. Audit these two game archetypes against JGengine:

Archetype A: <name>
Archetype B: <name>

Engine surface summary:
- PlayableGame fields: <list>
- GameCameraConfig: <list>
- Reserved input actions: <list>
- World features: <list>
- Shell-provided: orbit/first-person camera, WASD movement, hotbar, primary-click=ability, entity targeting, proximity prompts, projectile tracers, floating damage text

For each archetype, answer:
1. Can the archetype's camera mode be expressed via GameCameraConfig or does the shell hardcode something that blocks it?
2. Can the archetype's input scheme be expressed via ActionCodesMap, or does the shell intercept/reserve keys that block it?
3. Can the archetype's movement model be implemented in game code, or does GamePlayerShell's FrameDriver monopolize player motion?
4. Does the archetype need a primitive the engine does not have (pathfinding, drag-select, grid-snap, building rotation, etc.)?
5. Does the archetype need a world feature the engine does not render (2D sprite batching, side-scrolling, isometric, split-screen)?
6. Does the archetype need UI primitives the engine does not ship (minimap, radial menu, drag-and-drop inventory)?
7. Are there asset pack gaps (e.g. no buildings indexed, no vehicles, no food props)?

Return a structured pain point list per archetype. Be specific: name the exact file/prop that blocks it, or the exact primitive that is missing.
```

**Completion criterion:** Every archetype from Step 2 has been dispatched and returned results. No archetype is unaudited.

### Step 6 — Pain point harvest

Consolidate subagent results into a single **pain point registry**.

**Deduplicate:** Two archetypes needing "click-to-move" is one pain point, not two.
**Classify:**
- `shell` — fix in `@jgengine/shell`
- `core` — fix in `@jgengine/core`
- `assets` — fix in `@jgengine/assets` (reindex, new packs)
- `react` — fix in `@jgengine/react` (headless UI primitives)

**Severity override:** A subagent may mark something `workaround` that is actually `blocked` upon closer inspection — recheck anything that touches `GamePlayerShell` movement or camera.

**Completion criterion:** A deduplicated, classified, severity-ranked pain point list exists. The list names the exact engine surface that needs to change.

### Step 7 — Living document

Write the full catalog to `skills/jgengine-archetype-testbed/GAME_ARCHETYPES.md`. Structure:

```markdown
# Game Archetype Catalog

## <Archetype Name>
**Family:** <genre tag>
**Mechanical fingerprint:** <one-line summary>
**Subsystems:** <list>
**Pain points:** <list with severity and classification>
**Workarounds:** <any known workaround>
**Engine gaps filed:** <issue links, or "not yet filed">
```

This file is **append-only** — new archetypes are added at the bottom; existing entries are updated when gaps close. It is the permanent record of what JGengine can and cannot express.

**Completion criterion:** `GAME_ARCHETYPES.md` is written and committed. Every archetype from the audit appears in it.

### Step 8 — File gaps

For every `blocked` or `core`-classified pain point that two or more archetypes need, file an issue at `github.com/Noisemaker111/jgengine/issues` or open a PR.

**Issue template:**
- Title: `engine: <subsystem> missing for <archetype family>`
- Body: What the archetype needs, why current surface blocks it, suggested API addition, severity
- Label: `engine-gap` or `shell-hardcode`

For `shell` hardcodes that block a single archetype, file as `shell: <behavior> should be configurable via PlayableGame.camera / input`.

**Completion criterion:** Every `blocked` pain point is either filed as an issue, fixed in a PR, or explicitly deferred with a reason.

## Rules

1. **Never build a full game** — this skill is reconnaissance, not construction. Testbeds are mental or one-file mechanical probes.
2. **Always read the engine first** — inventing archetypes blind to `jgengine-api` produces phantom gaps (things that already exist) and misses real ones.
3. **Deduplicate aggressively** — "click-to-move" for an RTS and "click-to-move" for a city builder is the same pain point.
4. **Distinguish blocked from workaround** — a workaround that requires forking the shell is `blocked`, not `workaround`.
5. **Prefer engine gaps to game hacks** — if two archetypes need it, it belongs in core or shell, not a per-game workaround.
6. **Update the living document** — every run adds archetypes or closes gaps. Stale entries are worse than missing entries.
7. **Use subagents for scale** — 2 archetypes per subagent, dispatched in parallel. Do not audit 20 archetypes serially.
