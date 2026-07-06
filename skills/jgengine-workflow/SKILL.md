---
name: jgengine-workflow
description: >
  Workflow for shipping a game on JGengine (@jgengine packages) in one pass. USE THIS
  when the user asks to make/build any game with jgengine ("make bloons tower defense
  with jgengine", "build an MMO on jgengine") — it defines what "done" means and how to
  get there without half-built systems. Covers the one-pass rule, the definition of done,
  the no-half-systems rule, and reporting engine gaps upstream.
  Triggers: jgengine, make a game, build a game, new game, jgengine-workflow.
---

# JGengine — Ship a game in one pass

The deliverable is a **finished vertical slice** — something a player would call a game — produced in **one pass**. A half-built game is worthless: "compiles and the hooks are wired" is the failure mode this skill exists to kill.

## Read first (both, before the first edit)

| What | Why |
|------|-----|
| `jgengine-api` | Install + setup, the engine surface, conventions, definition of done |
| `jgengine-ui` | How it must look and behave — the quality bar |

The shell (`@jgengine/shell`) already gives you: orbit camera + follow feel, input tracker, hotbar/primary-click plumbing, `GameUiPreview`, error overlay. Never rebuild these per game.

## Take the reading — don't ask

A named game **is** the scope answer. "Make Fallout but multiplayer" means the canonical mainline experience — first/third-person wasteland RPG: gunplay plus targeted-shot mode, S.P.E.C.I.A.L.-style pool stats, XP/perks, loot + caps economy, quests + dialogue, party play — not a quiz about it. Never ask "isometric or FPS?", "does this scope work?", "want me to cut quests?", or offer a menu of slices. State your reading in one line, then show the plan.

A clarifying question is justified only when two readings would change more than half the build **and** the request genuinely doesn't pick one — and even then, name the default you'll take and keep moving unless stopped.

## First response = the whole blueprint

Your first substantive response is the complete build plan — not a scope proposal, the blueprint you then execute in the same pass:

- **System list** — every signature system of the named fantasy, each shipped whole. Max scope is the default; a cut is a last resort, recorded with its reason.
- **File tree** — every file you will create under `game/` (catalogs, handlers, loop, quests, curves, ui components), one line each.
- **Catalog ids** — the actual entity / item / object / loot-table / quest id lists.
- **Keybind table** — lives in `keybinds.ts` (named actions + `hotbarSlotBindings(n)`); action → key, checked: one key, one action (a crouch toggle on `C` and a character sheet on `C` is a shipped bug).
- **UI zone map** — which HUD cluster lives in which `GameUI.tsx` grid zone.
- **Multiplayer shape** — adapter + topology (`"shared" | "lobbies" | "private"`) and which systems sync.
- **Staged screenshot scenario** for `GameUiPreview`.

Then build it end to end. Do **not**:

- stop mid-way to ask "should I continue?", "want the UI now?", or offer next-step menus;
- ship a "functional first pass" intending polish later — later never comes;
- split the game across waiting-for-feedback checkpoints.

## Definition of done — every box, every time

1. **Loads in the shell**: registered in your `GameRegistry`, renders through `GamePlayerShell`.
2. **Core fantasy playable in 60 seconds**: move, act on the world, get feedback, and be able to fail and succeed. If the fantasy is "mage fights monsters", a bolt must visibly travel, hit, drop loot, and progress a quest.
3. **Full HUD per `jgengine-ui`**: unit frames, hotbar with cooldown sweeps + keybind badges, target frame, feedback (floating text — not `console.warn`), themed panels. Genre-appropriate art direction, not debug gray.
4. **Camera feel tuned** via `PlayableGame.camera` — follow lock, smoothing, distances. Default values untouched means you didn't play it in your head.
5. **Screenshots taken and judged**: stage a rich `GameUiPreview` scenario (target locked, cooldown running, quest active, non-full health), screenshot it, and look at the image. If the shot would embarrass a release announcement, the game is not done.
6. **Tests** for pure game math (XP curves, cooldowns, spawn/aggro logic) co-located in the game.
7. Type-check green.

## No half systems

Every system the game declares must be fully consumed end to end. The target is the fantasy's **full** signature set, finished; when something must give, give by **dropping a whole system** (with the reason in your report), never by shipping half of one:

| Half (never ship) | Whole |
|-------------------|-------|
| Quest registered, no tracker UI | Quest + tracker + turn-in feedback — or no quests |
| Ability without cooldown visual + cost gating | All four slot states per `jgengine-ui` — or fewer abilities |
| Keybind wired but not shown anywhere | Every binding visible on its control |
| Modal stub / "coming soon" panel | Finished panel — or no panel and no keybind for it |
| Inventory system with no way to gain items | Loot/shop loop closed — or no inventory |
| Leaderboard tracked, never displayed | HUD or panel readout — or don't track |

A finished game beats a skeleton every time — and "finished" is judged against the full system list from your blueprint, not a trimmed one.

## Engine gaps

When the game needs a primitive the engine should own (any loop a second game would also need — loot roll, shop buy, kit seeding), don't silently hand-roll a workaround: check whether `@jgengine/core` already has it (read `jgengine-api` fully first — most "missing" primitives exist), and if it genuinely doesn't, file the gap at [github.com/Noisemaker111/jgengine/issues](https://github.com/Noisemaker111/jgengine/issues) — what you were building, the glue it forced, the primitive signature you wanted — or PR the primitive. Then either scope the dependent system honestly around the gap or cut it whole.

## Isolation

Build from these skills, not by copying another game's code — if the only way to figure out an engine call is to peek at someone else's usage, that's a skill gap: report it so the docs get fixed.
