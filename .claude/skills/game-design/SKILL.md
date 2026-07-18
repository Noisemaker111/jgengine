---
name: game-design
description: Design, audit, implement, and validate player experience, loops, systems, progression, and balance.
---

# Game design

## Ownership

Own the intended player experience and the rules that produce it: fantasy, pillars, verbs, decisions, feedback, loops, resources, progression, challenge, failure, onboarding, and social dynamics. Treat design claims as hypotheses proved by play, not a feature inventory or genre imitation.

Use `level-design` for spatial realization; route implementation to `jgengine-gameplay`, `jgengine-world`, `jgengine-combat`, `jgengine-ui`, `jgengine-multiplayer` once intent is coherent.

Read [references/application-playbook.md](references/application-playbook.md) only when the task explicitly calls for design depth — a design brief, a redesign, or "make this fun/better" work; it is not a mandatory step of creating a game. Read [references/field-guide.md](references/field-guide.md) when the task needs deeper loop, economy, progression, genre, accessibility, or research guidance.

## Choose the mode

Greenfield: produce a vertical-slice contract (promise, pillars, core decision, loops, progression, failure/recovery) and build the smallest slice testing the riskiest assumption — see playbook §1. Existing game: reconstruct what it actually does from code and play, rank root problems by impact/confidence/reach/effort — see playbook §2.

“Improve with game design” is an implementation request, not just an audit: select the highest-leverage intervention, implement it through shared engine seams, and prove the changed player behavior.

## Required output contract

Every design pass yields an observed journey, a north star (promise, pillars, anti-pillars, core decision), a loop/flow model, a ranked bottleneck list with cited evidence, an intervention stack, a chosen design slice, and acceptance evidence. See [references/application-playbook.md](references/application-playbook.md) for the full contract and execution rules (verb->feedback->consequence chains, loop/progression/challenge discipline, upstream ownership).

## Completion

An audit is not completion for a build/improve request. Finish when the slice is playable, a fresh player can state goal/choice/consequence, failure/recovery behave as intended, and evidence supports the pillars. Use `jgengine-verify` and `workflow` to ship.
