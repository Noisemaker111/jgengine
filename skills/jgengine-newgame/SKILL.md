---
name: jgengine-newgame
description: Use when the user asks to build or make a new game with JGengine — the master blueprint (full-scope plan for the whole game) and the phased build workflow that carries an empty project to the complete game, each phase whole, no half systems.
---

# JGengine — Blueprint the whole game, build it in phases

The deliverable is the **complete idea** — the game the user named, at the scale that makes that game fun. You do not build a cut-down "slice" to show progress, and you never hand over a half version: work is phased, every phase ends whole, and the game is done only when the last phase lands. "Compiles and the hooks are wired" is the failure mode this skill exists to kill.

The shell (`@jgengine/shell`) already gives you: third-person orbit camera **and** first-person mouse-look (pointer-lock + centered reticle + weapon viewmodel), input tracker, hotbar/primary-click plumbing, world-space enemy health bars, floating damage/heal numbers, projectile tracers, `GameUiPreview`, error overlay. Never rebuild these per game — a hand-written reticle, world-space health bar, or floating-damage-number component means you missed a switch the engine already flips (see the archetype recipe below).

## Read first (both, before the blueprint)

| What | Why |
|------|-----|
| `jgengine-api` | Install + setup, the engine surface, the UI quality bar, asset sourcing |
| `jgengine-verify` | How to prove it works — browserless scene gate, shoot last |
| `fan-out` | Cheap workers run verify / shoot / bulk work — not this session |

## Take the reading — don't ask

Mechanical legs (verify, shoot, bulk reads) follow the **`fan-out`** skill — not this one. Research only novel engine seams; scaffolding already in `jgengine-api` is not research.

A named game **is** the scope answer. "Make Fallout but multiplayer" means the canonical mainline experience — first/third-person wasteland RPG: gunplay plus targeted-shot mode, S.P.E.C.I.A.L.-style stats, XP/perks, loot + caps economy, quests + dialogue, settlements, party play — not a quiz about it. Never ask "isometric or FPS?", "does this scope work?", "want me to cut quests?", or offer a menu of smaller versions. State your reading in one line, then show the master blueprint.

A clarifying question is justified only when two readings would change more than half the build **and** the request genuinely doesn't pick one — and even then, name the default you'll take and keep moving unless stopped.

## First response = the master blueprint

Your first substantive response is the complete plan for the **full game** — every part of it, not a starter scope:

- **Pillars, in priority order** — 3–5 one-line pillars, **ranked**, naming what the game is for ("legible emergence > zoom is the reward > the chronicle is the product > watchable by default"). Every later trade-off is settled by pillar rank instead of relitigated; a feature that serves no pillar doesn't ship.
- **Perspective** — first- or third-person, committed **up front** and stated in one line; it drives camera, input, HUD, and combat feel. A first-person shooter only discovered to be first-person three QA passes in is a rebuild, not a fix. Set `camera: { perspective: "first" }` in the `defineGame({...})` call to match (`"first"` mounts mouse-look + reticle + viewmodel; default `"third"` is the orbit camera). If the fantasy is a shooter, say "first-person" and mean it. A board/card/menu game with no 3D camera at all sets `presentation: "hud"` in `defineGame({...})` instead — the shell mounts no canvas/camera rig/pointer, just `GameUI` plus the command/input loop; don't reach for `flat()` + a parked camera to fake it.
- **System list** — every signature system of the named fantasy, at full depth (weapon mods and damage types, not just "guns"). A cut is a last resort, recorded with its reason.
- **Coupling map** — for sim-shaped games: each system names the existing systems it feeds and reads, as cause→effect chains a player can reconstruct by watching ("drought → failed harvest → hunger → unrest"). A threat or event system is a *coupling into existing systems*, never a standalone effect — plague travels the trade routes, fire spreads with the wind system's wind. Prefer one legible failure pipeline that many systems feed over five private ones.
- **Content budget** — numbers per system, sized by what the fantasy needs, not what's easy to type: items, enemy types, quests, zones, vendors, recipes (floors in "Content scale" below).
- **Asset plan** — which packs (per `jgengine-api`'s Assets section) cover ground, structures, props, characters/enemies, items; pack → catalog-id mapping; one style family.
- **Art direction** — a *decision*, not an adjective. One named aesthetic phrase ("illuminated-manuscript storybook", "neon brutalist"), a committed palette (4–6 hex values covering ground/sky plus UI panel, ink, and accent), a type voice, and a UI copy register (buttons in the fantasy's own language — "Unleash plague", not "Spawn disease event"). Written in the blueprint so every phase colors inside the same lines; "make it look nice" produces the murk this bullet exists to kill.
- **File tree** — one line per file: the skeleton at the top of `src/` (`game.config.ts`, `index.tsx`, `main.tsx`, `loop.ts`, `world.ts`, `index.css`) plus the root `index.html` + `vite.config.ts` that make the game a standalone Vite app, plus every catalog, generator, handler, quest, curve, and UI component under `src/game/`.
- **Catalog ids** — the archetype entity / item / object / loot-table / quest ids; the generators below produce the breadth.
- **Keybind table** — lives in `keybinds.ts` (named actions + `hotbarSlotBindings(n)`); action → key, checked: one key, one action — including mode toggles (aim-toggle on `V` plus a V.A.T.S. key on `V` is the classic collision).
- **UI zone map** — which HUD cluster lives in which `GameUI.tsx` grid zone.
- **Multiplayer shape** — adapter + topology (`"shared" | "lobbies" | "private"`) and which systems sync.
- **Non-goals** — the explicit cut list: what this game deliberately does not do, each with its one-line reason ("battles resolve abstractly — this is a chronicle, not a wargame"). Scope bleeds toward whatever was never ruled out.
- **Phase plan** — the ordered phases that take an empty project to the complete blueprint, each phase a coherent whole (see below).
- **Staged screenshot scenario** per phase for `GameUiPreview`, plus each phase's **observable acceptance**: what a player *experiences* in a stated time window, not a feature list — "left at max speed for 10 minutes: visible growth, 15+ log entries, no runaway values", "fly from the far overview to a market stall at 60 fps". A phase whose acceptance can't be phrased as something seen or felt isn't a phase, it's plumbing.

The blueprint message ends with one question — "anything you want changed before I build?" — the only checkpoint in the entire build. Fold in whatever the user answers, then execute the phases straight through with no further approval stops. This is not a scope quiz: the blueprint already commits to the full canonical reading of the request; the question invites corrections, it doesn't outsource decisions.

## Phases: every increment is whole, none of them is "the game"

Split the blueprint into ordered phases. Each phase:

- lands a coherent set of systems **finished end to end** — logic + that phase's share of the content budget + UI + real assets + feedback. Nothing in a phase is stubbed "for a later phase";
- ends verified: type-check green, staged screenshot taken and judged against `jgengine-api`'s UI quality bar;
- flows into the next without stopping to ask "should I continue?" or demoing a half version — the confirmed blueprint is the approval. If a session ends mid-build, the phase plan is the roadmap the next session resumes from, exactly where it left off;
- is reported in one line — "phase N of M complete", never as a finished game; the next phase starts on its own line, not buried in the status. Fan the phase's mechanical legs per the **`fan-out`** skill (catalog generation, type-check, staged screenshot) — don't run them on the frontier model. Done means the last phase landed and the full-game checklist below passes.

A sensible phase shape: (1) world + movement + camera + core combat loop with real assets; (2) full item/loot/economy breadth + inventory UI; (3) progression + quests + dialogue; (4) multiplayer sync + social; (5) remaining systems + content fill to budget + audio/juice. Adapt to the fantasy — but phase 1 already looks like the game, not a graybox.

## No half systems — within any phase

Every system a phase declares must be fully consumed end to end by that phase's close. Defer by **moving whole systems to a later phase**, never by shipping half of one now:

| Half (never ship) | Whole |
|-------------------|-------|
| Quest registered, no tracker UI | Quest + tracker + turn-in feedback — or the quest system moves to its phase intact |
| Ability without cooldown visual + cost gating | All four slot states per `jgengine-api`'s UI quality bar |
| Keybind wired but not shown anywhere | Every binding visible on its control |
| Modal stub / "coming soon" panel | Finished panel — or no panel and no keybind yet |
| Inventory system with no way to gain items | Loot/shop loop closed in the same phase |
| Leaderboard tracked, never displayed | HUD or panel readout ships with the tracking |

## Content scale — the four-items trap

What makes a named fantasy fun is breadth: hundreds of items, dozens of enemy types, quest variety. Left alone, a builder ships 4 items and calls the system done — that is a placeholder, not a game. Two rules:

1. **Budget from the fantasy, not from effort.** A Fallout-like carries 10+ weapon families with condition tiers, dozens of armor pieces, chems, junk components; a car game needs a garage of dozens of distinct cars with real stat spreads, not 4. The blueprint states the numbers; the phases hit them.
2. **Reach the numbers combinatorially, not by hand.** Catalogs are data — generate them. `base × material × quality tier × affix` yields hundreds of distinct, balanced entries from a few arrays and a scaling formula ("Rusty/Worn/Sturdy/Pristine 10mm Pistol", damage scaled per tier). Same for enemies (`family × rank × zone level`) and quests (radiant templates × target × location). Hand-write the archetypes; program the breadth. Generated entries are real entries — they need drops, prices, and assets like any other.

Floors for any combat/loot game (scale **up** per fantasy, never down): **50+ items** across 3+ domains, **12+ enemy types** in 3+ families with distinct stats/behavior, **8+ quests**, **2+ vendors** with real stock, **3+ visually distinct zones**.

## The world is content too

No phase ships a flat plane with squares on it. The floor, structures, and props are inside every phase's exit bar:

- **Ground** — textured/material'd terrain or tiles with variation (Poly Haven / ambientCG per `jgengine-api`'s Assets section), never the default grid or a flat color. Supply it via `environment` in `defineGame({...})` (a canvas component); the shell renders it in place of the default ground plane + debug grid + rock field. A world of kind `environment()` skips this — the shell auto-renders it as the backdrop.
- **Structures** — the buildings and landmarks the fantasy implies (a wasteland has ruins, a settlement, an interior or two), placed as scene objects with real models.
- **Prop density** — target 100+ placed objects across zones (wrecks, rocks, furniture, loot containers) from real packs, not colored boxes.
- **Zone readability** — zones differ at a glance: palette, density, one landmark each.
- **Entities** — real models or `entitySprites` billboards; a capsule is never a shipped enemy.

## Done — the full-game checklist

The game is done when the **entire blueprint** is delivered:

1. Every blueprinted system finished whole; every content budget met — verified by counting catalog entries, not vibes.
2. Loads through `GamePlayerShell` via your `GameRegistry`; core fantasy playable end to end within 60 seconds of spawning. `bun dev` inside the game directory also launches it standalone, and a game under `Games/*` auto-registers in the dev runner and the jgengine.com Games dropdown — no registry entry, alias, or dependency to wire by hand.
3. Full HUD per `jgengine-api`'s UI quality bar; every binding visible; camera tuned via `camera` in `defineGame({...})` (defaults untouched means the feel was never checked).
4. World dressed per "The world is content too"; zero default-material primitives anywhere.
5. World content verified deterministically: for any game with an `environment()` world, a co-located `<game>.world.test.ts` asserts `summarizeEnvironment(world)` (`@jgengine/core/world/environmentSummary`) is non-empty with the expected terrain/building/water/vegetation/weather counts. This is the scene-correctness gate — it runs in `bun test`, catches empty, miscounted, or flat-terrain scenes, and never launches a browser.
6. Staged `GameUiPreview` and `--mode play` screenshots taken and **judged by looking at them** — the screenshot is the *final human glance*, never the verification loop (once `bun run shoot` hangs on Chromium, don't re-run it in the foreground; the world test above is what proves the scene resolved). If a shot would embarrass a release announcement, it isn't done.
7. Tests for pure game math (curves, cooldowns, generators, spawn logic) co-located; type-check green.

## Archetype recipe — first-person looter-shooter

The most common "make an FPS / looter-shooter" setup is a handful of engine switches now, not a five-pass QA scavenger hunt. Assemble it from primitives — do not hand-roll any of these:

- **Perspective**: `camera: { perspective: "first", firstPerson: { eyeHeight, sensitivity, reticle, viewmodel } }` — mouse-look, a centered crosshair, and a weapon viewmodel come from the shell. Leave `turnLeft`/`turnRight` unbound (the mouse looks); left-click fires the first non-empty hotbar slot, so keep the gun in the hotbar.
- **Gun**: an item with `use: "fireGun"`, `weapon: { damage, range, spread?, pellets? }`; the handler calls `fireProjectile` → `settleProjectile` off `input.aim`. Firing this way is what makes the shell draw the **tracer** — never resolve a gunshot with `effect({ to })`.
- **Enemy health bars**: `worldHealthBars: true` passed to `defineGame({...})` — the shell floats a bar over every non-local entity that carries the health stat. No screen-space projection math.
- **Damage numbers**: automatic — every applied damage/heal effect emits `entity.floatText`, which the shell renders as rising numbers. No per-game floating-combat-text component (`ctx.scene.entity.floatText(...)` exists for crits/pickups if you want extras).
- **Death / level-up / loot toast**: headless `DeathScreen`, `LevelUpFlash`, `ToastStack` from `@jgengine/react` (bind the toast to `loot.granted`). Theme them; don't rebuild them.
- **Spawn on the surface**: `ctx.world.groundHeightAt(x, z)` is the canonical terrain sampler for the game's declared world (`groundFieldFor` in `@jgengine/core/world/terrain`); the shell grounds the local player's pose and `environment()` structures with the same field automatically. Every other spawn, placement, and waypoint y is still the game's call — pass it through `groundHeightAt`, never hardcode y = 0 on a world with relief.

One game is a probe; if a second first-person game needs this same bundle, promote the recipe to an engine preset. Until then it is a recipe, not a `defineGame` field.

## Archetype recipe — furnished interior from a modular kit

The interior analog of the shooter recipe: a life-sim, dollhouse, base-builder, or shop is a **grid of cells** dressed from one modular kit (Kenney furniture-kit + mini-characters is a complete Sims-style set). Assemble it from primitives — do not hand-roll pivot math or a ground hack:

- **Own ground, not the debug grid**: set `environment` in `defineGame({...})` to a canvas component that draws your floor/room shell (a plane, tiled floor GLBs, or a skybox). When present, the shell renders it **instead of** the default ground plane + grid + rock field — an interior should never show the outdoor scatter. Leave it unset only for open-world scenes that want the default terrain (or use an `environment()` world, which auto-renders without one).
- **Place on cell centers, let the engine center + ground-snap**: models resolved through `objectModels` carry measured `dims` from `@jgengine/assets`; with the default anchor `"center"` the shell centers each footprint on its placement point and snaps its base to the floor. Build a `cells` grid (1 unit each), then `object.place(floorId, cx, 0, cz)`, `object.place(wallId, edgeX, 0, edgeZ, { rotation })` on cell edges, `object.place(furnitureId, cx, 0, cz, { rotation })` — no `dimensions.ts`, no `placeCentered`, no `objectCenter` registry. (See `jgengine-api` Assets rule 5.)
- **Walls on edges, floors + furniture on centers**: a wall's placement point is the shared edge between two cells (rotate 0/90° to face along it); floors and furniture sit on the cell center. Doorways are a skipped wall segment.
- **Characters**: mini-characters are rigged GLBs — wire them through `entityModels`; the same center/ground-snap applies, so they stand on the floor without a per-model `y`.
- **Time is a system, not a hack**: a life-sim runs on a clock. Set `defineGame({ time: { scale, dayLength, start } })` and write every need decay, growth, and schedule against `onTick`'s `dt` (game-time) or `ctx.time.after/every/at` — then pause and 1×/2×/3×/4× fast-forward affect the *whole* world (needs, jobs, pregnancies, cooking) for free. Never scale time by hand-multiplying in one system; that desyncs the rest. Render the clock + speed controls from `useGameClock()` (see `jgengine-api` → `ctx.time`).

One interior is a probe; if a second needs this same cell→floor/wall/furniture loop, promote it to an engine `roomGrid` helper (cells → floor tiles + edge walls + doorways). Until then it is a recipe, not a `defineGame` field.

## Archetype recipe — voxel trapdoor board (integer solids)

When the fantasy is a board/grid you stand on that can open underfoot (minesweeper trapdoors, disappearing tiles, dig-through floors), use `collision: { voxel: true }` and treat placed scene objects as the solid lattice — do not script a fake fall with `setPose`:

- **Integer positions are solid.** The shell builds `isSolid` from `ctx.scene.object.list()` as exact `` `${x},${y},${z}` `` string keys and queries integer cell coords. Place walkable tiles at integer `[x, y, z]`.
- **Fractional positions are free decoration.** Furniture, frames, lamps at non-integer coords render but never block — no separate "decor layer" API.
- **Remove the object → real gravity fall.** Deleting a solid tile drops the object count, rebuilds the solid cache, and the voxel body free-falls under `physics.gravity` until it hits another solid (pit floor below). Landing = poll `entity.position[1]` / vertical velocity in `onTick`.
- **`visual.scale` does not change collision.** Every solid is a full unit cell regardless of mesh scale. Short "revealed" tiles that look thinner still collide as 1³ — differentiate revealed cells by color/billboard, not by shrinking the collider, or the player floats.
- **Vertical motion only for the local voxel body.** `ctx.player.motion.setY` / `impulse` / `setVerticalVelocity` work; the voxel body is created once and is not a general XY teleport. Blast-off and ride-back are vertical; companions/NPCs can `setPose` freely.
- **Solid cache keys off object count.** Place/remove that changes `list().length` rebuilds solids; in-place position edits that keep the same count will not — prefer remove+place when a tile must move.

Full collision/lighting notes: `jgengine-api` → Controller kinematics + `reference/world.md` sky gotcha.

## First-shot art recipe — before the first `shoot`

The first `--mode play` screenshot must already pass this bar so you do not burn four shoot loops on framing and murk (see `jgengine-verify`):

1. **Sky:** `sky({ preset: "day", … })` when you need readable brightness. `sunIntensity` / `ambientIntensity` overrides apply only to the **day** keyframe — `dusk` / `night` (and dawn) ignore them and stay dim. Want warm evening mood without murk? Use `day` + warm `horizonColor` / `zenithColor`, or accept dusk's hardcoded look.
2. **Forward landmark:** default first-person yaw looks down **+Z** with pitch 0. Put the board, crew, or focal prop ahead on +Z — never a giant black panel / TV / void as the first thing in frame.
3. **Readable play surface:** tile/ground colors that separate from the backdrop at a glance (ivory/brass on warm room, not murky green on dusk).
4. **Scale props as figures, not edge crops:** billboard crew slightly ahead and sized so hats/silhouettes read as characters, not huge edge blobs.
5. **Judge once:** open the PNG; if it fails this recipe, fix world/sky/placement and shoot **once** more — never iterate shoot as the design loop.

## Archetype recipe — living-world sim (kingdom / colony / ambient god-game)

A world that runs itself while the player watches or nudges. The engine covers more of this than it looks; the design rules below are what make it *watchable* rather than a spreadsheet:

- **Split the RNG by purpose, once, at the top**: `seededStreams(seed)` (`@jgengine/core/random/rng`) — one stream for worldgen, a separate one for everything that happens after year 0. Then intervening in a run can never change the map, and the same seed is a shareable world.
- **Site the world with `position`**: several `building({ position, count, seed })` clusters in one `environment()` are distinct settlements; buildings ground-snap to the terrain field. Sample the same `resolveTerrainField` for anything the game moves across the terrain — the field the shell renders is the field you query.
- **Time is the spine**: `time: { scale, dayLength, speeds, daysPerYear?, seasons? }` + `ctx.time.every/after/at` for every system tick — never a hand-multiplied timer (see the interior recipe). Year/season are engine primitives: `ctx.time.calendar()` already reports `year`/`dayOfYear`/`yearFraction`, and naming `seasons` (equal segments of the year) populates `calendar().season` — read that one calendar instead of a game-owned day-count module.
- **Two-layer population** (the grand-strategy trick): settlements carry population as plain numbers with drift rates; only ~a dozen *notables* are real named records with age, traits, and relationships. Pools make the world feel big; notables make the chronicle feel personal. Neither needs an entity until it must be visible.
- **Agents interpolate, systems tick**: a caravan/army stores its path and departure/arrival sim-times; the render side interpolates position from current sim-time each frame. Motion stays smooth at any speed step and nothing teleports when the player scrubs to 30×.
- **The event log is the product**: every system emits dated, named entries ("Year 2, day 113 — Osterholt brings in a lean harvest"). Keep the full history in a game-owned array (the engine `feed` is a bounded ring — push to it for reactivity, not as the archive).
- **Spectate-by-click is possession**: leave `camera.followEntityId` unset and the rigs follow `ctx.player.possession.active(userId)` every frame — so `pointer` click → `possession.own/possess` an NPC's entity puts the camera on it live, and `disown` releases back to the free rig. This is the supported runtime camera retarget; there is no imperative fly-to yet.
- **Every positive feedback loop ships with a damper**: growth raises food pressure, wealth attracts trouble, strength costs upkeep. State the pairs in the blueprint; a sim without dampers runs away long before anyone watches it for ten minutes.
- **Acceptance is timed observation, not a feature list**: blueprint it as "left running at max speed with zero input for N minutes, a viewer sees X events, Y visible movers, and no runaway values", and verify exactly that with the sim's pure functions in `bun test`.

## Engine gaps

When the game needs a primitive the engine should own (any loop a second game would also need — loot roll, shop buy, kit seeding), don't silently hand-roll a workaround: check whether `@jgengine/core` already has it (read `jgengine-api` fully first — most "missing" primitives exist), and if it genuinely doesn't, fix or PR the primitive directly — inside the engine repo, closing the gap is the job, not logging it. (Consumers building on the published SDK file it at [github.com/Noisemaker111/jgengine/issues](https://github.com/Noisemaker111/jgengine/issues) instead.) Then schedule the dependent system into a later phase around the gap, honestly.

## Isolation

Build from these skills, not by copying another game's code — if the only way to figure out an engine call is to peek at someone else's usage, that's a skill gap: report it so the docs get fixed.
