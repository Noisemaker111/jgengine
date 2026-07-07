---
name: jgengine-newgame
description: Use when the user asks to build or make a new game with JGengine — the master blueprint (full-scope plan for the whole game) and the phased build workflow that carries an empty project to the complete game, each phase whole, no half systems.
---

# JGengine — Blueprint the whole game, build it in phases

The deliverable is the **complete idea** — the game the user named, at the scale that makes that game fun. You do not build a cut-down "slice" to show progress, and you never hand over a half version: work is phased, every phase ends whole, and the game is done only when the last phase lands. "Compiles and the hooks are wired" is the failure mode this skill exists to kill.

The shell (`@jgengine/shell`) already gives you: third-person orbit camera **and** first-person mouse-look (pointer-lock + centered reticle + weapon viewmodel), input tracker, hotbar/primary-click plumbing, world-space enemy health bars, floating damage/heal numbers, projectile tracers, `GameUiPreview`, error overlay. Never rebuild these per game — a hand-written reticle, world-space health bar, or floating-damage-number component means you missed a switch the engine already flips (see the archetype recipe below).

## Read first (all three, before the blueprint)

| What | Why |
|------|-----|
| `jgengine-api` | Install + setup, the engine surface, conventions |
| `jgengine-ui` | How it must look and behave — the quality bar |
| `jgengine-assets` | Where real models/textures/audio come from — no primitive placeholders ship |

## Take the reading — don't ask

A named game **is** the scope answer. "Make Fallout but multiplayer" means the canonical mainline experience — first/third-person wasteland RPG: gunplay plus targeted-shot mode, S.P.E.C.I.A.L.-style stats, XP/perks, loot + caps economy, quests + dialogue, settlements, party play — not a quiz about it. Never ask "isometric or FPS?", "does this scope work?", "want me to cut quests?", or offer a menu of smaller versions. State your reading in one line, then show the master blueprint.

A clarifying question is justified only when two readings would change more than half the build **and** the request genuinely doesn't pick one — and even then, name the default you'll take and keep moving unless stopped.

## First response = the master blueprint

Your first substantive response is the complete plan for the **full game** — every part of it, not a starter scope:

- **Perspective** — first- or third-person, committed **up front** and stated in one line; it drives camera, input, HUD, and combat feel. A first-person shooter only discovered to be first-person three QA passes in is a rebuild, not a fix. Set `PlayableGame.camera.perspective` to match (`"first"` mounts mouse-look + reticle + viewmodel; default `"third"` is the orbit camera). If the fantasy is a shooter, say "first-person" and mean it.
- **System list** — every signature system of the named fantasy, at full depth (weapon mods and damage types, not just "guns"). A cut is a last resort, recorded with its reason.
- **Content budget** — numbers per system, sized by what the fantasy needs, not what's easy to type: items, enemy types, quests, zones, vendors, recipes (floors in "Content scale" below).
- **Asset plan** — which packs (per `jgengine-assets`) cover ground, structures, props, characters/enemies, items; pack → catalog-id mapping; one style family.
- **File tree** — every file under `game/` (catalogs, generators, handlers, loop, quests, curves, ui components), one line each.
- **Catalog ids** — the archetype entity / item / object / loot-table / quest ids; the generators below produce the breadth.
- **Keybind table** — lives in `keybinds.ts` (named actions + `hotbarSlotBindings(n)`); action → key, checked: one key, one action — including mode toggles (aim-toggle on `V` plus a V.A.T.S. key on `V` is the classic collision).
- **UI zone map** — which HUD cluster lives in which `GameUI.tsx` grid zone.
- **Multiplayer shape** — adapter + topology (`"shared" | "lobbies" | "private"`) and which systems sync.
- **Phase plan** — the ordered phases that take an empty project to the complete blueprint, each phase a coherent whole (see below).
- **Staged screenshot scenario** per phase for `GameUiPreview`.

The blueprint message ends with one question — "anything you want changed before I build?" — the only checkpoint in the entire build. Fold in whatever the user answers, then execute the phases straight through with no further approval stops. This is not a scope quiz: the blueprint already commits to the full canonical reading of the request; the question invites corrections, it doesn't outsource decisions.

## Phases: every increment is whole, none of them is "the game"

Split the blueprint into ordered phases. Each phase:

- lands a coherent set of systems **finished end to end** — logic + that phase's share of the content budget + UI + real assets + feedback. Nothing in a phase is stubbed "for a later phase";
- ends verified: type-check green, staged screenshot taken and judged against `jgengine-ui`;
- flows into the next without stopping to ask "should I continue?" or demoing a half version — the confirmed blueprint is the approval. If a session ends mid-build, the phase plan is the roadmap the next session resumes from, exactly where it left off;
- is reported as "phase N of M complete", never as a finished game. Done means the last phase landed and the full-game checklist below passes.

A sensible phase shape: (1) world + movement + camera + core combat loop with real assets; (2) full item/loot/economy breadth + inventory UI; (3) progression + quests + dialogue; (4) multiplayer sync + social; (5) remaining systems + content fill to budget + audio/juice. Adapt to the fantasy — but phase 1 already looks like the game, not a graybox.

## No half systems — within any phase

Every system a phase declares must be fully consumed end to end by that phase's close. Defer by **moving whole systems to a later phase**, never by shipping half of one now:

| Half (never ship) | Whole |
|-------------------|-------|
| Quest registered, no tracker UI | Quest + tracker + turn-in feedback — or the quest system moves to its phase intact |
| Ability without cooldown visual + cost gating | All four slot states per `jgengine-ui` |
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

- **Ground** — textured/material'd terrain or tiles with variation (Poly Haven / ambientCG per `jgengine-assets`), never the default grid or a flat color. Supply it via `PlayableGame.environment` (a canvas component); the shell renders it in place of the default ground plane + debug grid + rock field.
- **Structures** — the buildings and landmarks the fantasy implies (a wasteland has ruins, a settlement, an interior or two), placed as scene objects with real models.
- **Prop density** — target 100+ placed objects across zones (wrecks, rocks, furniture, loot containers) from real packs, not colored boxes.
- **Zone readability** — zones differ at a glance: palette, density, one landmark each.
- **Entities** — real models or `entitySprites` billboards; a capsule is never a shipped enemy.

## Done — the full-game checklist

The game is done when the **entire blueprint** is delivered:

1. Every blueprinted system finished whole; every content budget met — verified by counting catalog entries, not vibes.
2. Loads through `GamePlayerShell` via your `GameRegistry`; core fantasy playable end to end within 60 seconds of spawning.
3. Full HUD per `jgengine-ui`; every binding visible; camera tuned via `PlayableGame.camera` (defaults untouched means the feel was never checked).
4. World dressed per "The world is content too"; zero default-material primitives anywhere.
5. World content verified deterministically: for any game with an `environment()` world, a co-located `<game>.world.test.ts` asserts `summarizeEnvironment(world)` (`@jgengine/core/world/environmentSummary`) is non-empty with the expected terrain/building/water/vegetation/weather counts. This is the scene-correctness gate — it runs in `bun test`, catches empty, miscounted, or flat-terrain scenes, and never launches a browser.
6. Staged `GameUiPreview` and `--mode play` screenshots taken and **judged by looking at them** — the screenshot is the *final human glance*, never the verification loop (once `bun run shoot` hangs on Chromium, don't re-run it in the foreground; the world test above is what proves the scene resolved). If a shot would embarrass a release announcement, it isn't done.
7. Tests for pure game math (curves, cooldowns, generators, spawn logic) co-located; type-check green.

## Archetype recipe — first-person looter-shooter

The most common "make an FPS / looter-shooter" setup is a handful of engine switches now, not a five-pass QA scavenger hunt. Assemble it from primitives — do not hand-roll any of these:

- **Perspective**: `camera: { perspective: "first", firstPerson: { eyeHeight, sensitivity, reticle, viewmodel } }` — mouse-look, a centered crosshair, and a weapon viewmodel come from the shell. Leave `turnLeft`/`turnRight` unbound (the mouse looks); left-click fires the first non-empty hotbar slot, so keep the gun in the hotbar.
- **Gun**: an item with `use: "fireGun"`, `weapon: { damage, range, spread?, pellets? }`; the handler calls `fireProjectile` → `settleProjectile` off `input.aim`. Firing this way is what makes the shell draw the **tracer** — never resolve a gunshot with `effect({ to })`.
- **Enemy health bars**: `worldHealthBars: true` on the `PlayableGame` — the shell floats a bar over every non-local entity that carries the health stat. No screen-space projection math.
- **Damage numbers**: automatic — every applied damage/heal effect emits `entity.floatText`, which the shell renders as rising numbers. No per-game floating-combat-text component (`ctx.scene.entity.floatText(...)` exists for crits/pickups if you want extras).
- **Death / level-up / loot toast**: headless `DeathScreen`, `LevelUpFlash`, `ToastStack` from `@jgengine/react` (bind the toast to `loot.granted`). Theme them; don't rebuild them.
- **Known gap — spawn on the surface**: the engine does **not** yet snap spawns to terrain height (core owns no terrain geometry — the ground mesh lives in the shell). On non-flat ground the game must sample its own ground height before `spawn` for now, or spawn on a `flat()` arena. Track it honestly; don't ship enemies clipping into hillsides and call it done.

One game is a probe; if a second first-person game needs this same bundle, promote the recipe to an engine preset. Until then it is a recipe, not a `defineGame` field.

## Archetype recipe — furnished interior from a modular kit

The interior analog of the shooter recipe: a life-sim, dollhouse, base-builder, or shop is a **grid of cells** dressed from one modular kit (Kenney furniture-kit + mini-characters is a complete Sims-style set). Assemble it from primitives — do not hand-roll pivot math or a ground hack:

- **Own ground, not the debug grid**: set `PlayableGame.environment` to a canvas component that draws your floor/room shell (a plane, tiled floor GLBs, or a skybox). When present, the shell renders it **instead of** the default ground plane + grid + rock field — an interior should never show the outdoor scatter. Leave it unset only for open-world scenes that want the default terrain.
- **Place on cell centers, let the engine center + ground-snap**: models resolved through `objectModels` carry measured `dims` from `@jgengine/assets`; with the default anchor `"center"` the shell centers each footprint on its placement point and snaps its base to the floor. Build a `cells` grid (1 unit each), then `object.place(floorId, cx, 0, cz)`, `object.place(wallId, edgeX, 0, edgeZ, { rotation })` on cell edges, `object.place(furnitureId, cx, 0, cz, { rotation })` — no `dimensions.ts`, no `placeCentered`, no `objectCenter` registry. (See `jgengine-assets` rule 5.)
- **Walls on edges, floors + furniture on centers**: a wall's placement point is the shared edge between two cells (rotate 0/90° to face along it); floors and furniture sit on the cell center. Doorways are a skipped wall segment.
- **Characters**: mini-characters are rigged GLBs — wire them through `entityModels`; the same center/ground-snap applies, so they stand on the floor without a per-model `y`.
- **Time is a system, not a hack**: a life-sim runs on a clock. Set `defineGame({ time: { scale, dayLength, start } })` and write every need decay, growth, and schedule against `onTick`'s `dt` (game-time) or `ctx.time.after/every/at` — then pause and 1×/2×/3×/4× fast-forward affect the *whole* world (needs, jobs, pregnancies, cooking) for free. Never scale time by hand-multiplying in one system; that desyncs the rest. Render the clock + speed controls from `useGameClock()` (see `jgengine-api` → `ctx.time`).

One interior is a probe; if a second needs this same cell→floor/wall/furniture loop, promote it to an engine `roomGrid` helper (cells → floor tiles + edge walls + doorways). Until then it is a recipe, not a `defineGame` field.

## Engine gaps

When the game needs a primitive the engine should own (any loop a second game would also need — loot roll, shop buy, kit seeding), don't silently hand-roll a workaround: check whether `@jgengine/core` already has it (read `jgengine-api` fully first — most "missing" primitives exist), and if it genuinely doesn't, fix or PR the primitive directly — inside the engine repo, closing the gap is the job, not logging it. (Consumers building on the published SDK file it at [github.com/Noisemaker111/jgengine/issues](https://github.com/Noisemaker111/jgengine/issues) instead.) Then schedule the dependent system into a later phase around the gap, honestly.

## Isolation

Build from these skills, not by copying another game's code — if the only way to figure out an engine call is to peek at someone else's usage, that's a skill gap: report it so the docs get fixed.
