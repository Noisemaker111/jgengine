---
name: game-design
description: Design, audit, implement, and validate player experience, loops, systems, progression, and balance.
---

# Game design

## Ownership

Own the intended player experience and the rules that produce it: fantasy, pillars, verbs, decisions, feedback, loops, resources, progression, challenge, failure, onboarding, and social dynamics. Treat design claims as hypotheses proved by play, not a feature inventory or genre imitation — no genre kits, presets, or archetypes; every game is a custom composition of needs (see [AGENTS.md](../../../AGENTS.md)).

Use `level-design` for spatial realization; route implementation to `jgengine-gameplay`, `jgengine-world`, `jgengine-combat`, `jgengine-ui`, `jgengine-multiplayer` once intent is coherent.

For a new game, start with `create-game-jg`, which agrees the direction and writes `PLAN.md` before any code. For a substantial existing-game quality pass spanning concept, depth, world and presentation, use `game-improvement` to sequence these owners and keep a per-game implementation plan and acceptance evidence.

For a greenfield build, the design work is the `## Design brief` in the game's `PLAN.md` (`create-game-jg` step 3): core, session and long loops, second 0, the first 10 minutes beat by beat, start state, content budget, systems, pace and onboarding. Read [references/application-playbook.md](references/application-playbook.md) §1 for how to design it. Audits may read only the playbook's audit sections. Read [references/field-guide.md](references/field-guide.md) when the task needs deeper loop, economy, progression, genre, accessibility, or research guidance.

## Choose the mode

Greenfield: write the design brief, then build milestone 1 as the core loop playable from second 0 and each later milestone as the next 10 minutes of play, proven by the game's from-zero flow — see playbook §1. Existing game: reconstruct what it actually does from code and play, rank root problems by impact/confidence/reach/effort — see playbook §2.

“Improve with game design” is an implementation request, not just an audit: select the highest-leverage intervention, implement it through shared engine seams, and prove the changed player behavior.

## Required output contract

Every design pass yields an observed journey, a north star (promise, pillars, anti-pillars, core decision), a loop/flow model, a ranked bottleneck list with cited evidence, an intervention stack, a chosen design slice, and acceptance evidence. See [references/application-playbook.md](references/application-playbook.md) for the full contract and execution rules (verb->feedback->consequence chains, loop/progression/challenge discipline, upstream ownership).

## Completion

An audit is not completion for a build/improve request. Finish when the slice is playable, a fresh player can state goal/choice/consequence, failure/recovery behave as intended, and evidence supports the pillars. Use `jgengine-verify` and `workflow` to ship.

**Required: player death is a designed, visible moment.** If the game can kill or down the player, death is part of the experience contract, not an invisible state reset. A lethal hit must resolve into an authored beat the player perceives and understands — a death or downed moment, the stakes it carries, and a legible path back into play (respawn, revive, restart) — never a silent teleport to spawn. Design what death means for this pitch (permadeath, checkpoint, bleed-out-and-revive, run reset) and treat "player dies with no acknowledged consequence" as a failure/recovery defect. `jgengine-ui` owns building the screen and respawn feedback.

## Persistent-builder checks

Before content, write a first-hour balance sheet: starting cash, time to first income, net income per hour at starting hardware and at ten times that hardware, bill cadence versus income, and the insolvency recovery path. Insolvency resets the affected player or changes their options; it never deletes the world. Express clicks and event rewards as a fraction of the designed income rate, never an unrelated flat payout.

Currency precision, elapsed-time anchoring, and reset mechanics are implemented per `jgengine-gameplay` "Persistent economies and input"; test fractional income over real tick cadences before tuning prices.

What a new game starts with is a design choice in the brief's `Second 0` line and capped by its start state; starting with nothing and earning the first tool or plot by play is a valid opening, and starting with half the game already built is not. The tutorial cannot lock the surface needed to complete itself: whatever its first step needs, the player has or can get by playing. Placement previews show cost and affordability inline.

For a persistent shared-world builder, verify capacity and first-player onboarding before scaling the content catalog; presence, command read scopes, territory, chat, and join retry UI come from their owners in `jgengine-world`, `jgengine-ui`, and `jgengine-multiplayer`.
