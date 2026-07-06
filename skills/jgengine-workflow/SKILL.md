---
name: jgengine-workflow
description: >
  Workflow for building a game on JGengine (@jgengine packages) to completion. USE THIS
  when the user asks to make/build any game with jgengine ("make bloons tower defense
  with jgengine", "build an MMO on jgengine"). First response = the master blueprint
  (full-scale system list, content budgets, asset plan, phase plan); then execute phase
  by phase until the whole idea is implemented. No half systems, no demo versions, no
  cut-down slices — content at fantasy scale (hundreds of items, not four), real assets,
  dressed worlds. Triggers: jgengine, make a game, build a game, new game,
  jgengine-workflow.
---

# JGengine — Blueprint the whole game, build it in phases

The deliverable is the **complete idea** — the game the user named, at the scale that makes that game fun. You do not build a cut-down "slice" to show progress, and you never hand over a half version: work is phased, every phase ends whole, and the game is done only when the last phase lands. "Compiles and the hooks are wired" is the failure mode this skill exists to kill.

The shell (`@jgengine/shell`) already gives you: orbit camera + follow feel, input tracker, hotbar/primary-click plumbing, `GameUiPreview`, error overlay. Never rebuild these per game.

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

The blueprint message ends by **starting phase 1** — never with "want me to begin?", "any changes?", or any other permission request. The user asked for the game; the blueprint is your statement of how, not a question.

## Phases: every increment is whole, none of them is "the game"

Split the blueprint into ordered phases. Each phase:

- lands a coherent set of systems **finished end to end** — logic + that phase's share of the content budget + UI + real assets + feedback. Nothing in a phase is stubbed "for a later phase";
- ends verified: type-check green, staged screenshot taken and judged against `jgengine-ui`;
- flows into the next without stopping to ask "should I continue?" or demoing a half version — the blueprint was the approval. If a session ends mid-build, the phase plan is the roadmap the next session resumes from, exactly where it left off;
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

- **Ground** — textured/material'd terrain or tiles with variation (Poly Haven / ambientCG per `jgengine-assets`), never the default grid or a flat color.
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
5. Staged `GameUiPreview` screenshots taken and **judged by looking at them** — if a shot would embarrass a release announcement, it isn't done.
6. Tests for pure game math (curves, cooldowns, generators, spawn logic) co-located; type-check green.

## Engine gaps

When the game needs a primitive the engine should own (any loop a second game would also need — loot roll, shop buy, kit seeding), don't silently hand-roll a workaround: check whether `@jgengine/core` already has it (read `jgengine-api` fully first — most "missing" primitives exist), and if it genuinely doesn't, file the gap at [github.com/Noisemaker111/jgengine/issues](https://github.com/Noisemaker111/jgengine/issues) — what you were building, the glue it forced, the primitive signature you wanted — or PR the primitive. Then schedule the dependent system into a later phase around the gap, honestly.

## Isolation

Build from these skills, not by copying another game's code — if the only way to figure out an engine call is to peek at someone else's usage, that's a skill gap: report it so the docs get fixed.
