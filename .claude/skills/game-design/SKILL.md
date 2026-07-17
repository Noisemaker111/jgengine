---
name: game-design
description: Design, audit, implement, and validate player experience, loops, systems, progression, and balance.
---

# Game design

## Ownership

Own the intended player experience and the rules that produce it: fantasy, pillars, verbs, decisions, feedback, loops, resources, progression, challenge, failure, onboarding, and social dynamics. Treat design claims as hypotheses proved by play—not a feature inventory, genre imitation, or the word “fun.”

Use `level-design` for spatial realization. Route implementation to `jgengine-gameplay`, `jgengine-world`, `jgengine-combat`, `jgengine-ui`, and `jgengine-multiplayer` after the design intent is coherent.

Read [references/application-playbook.md](references/application-playbook.md) whenever creating a game, redesigning one, or responding to “improve this game.” Read [references/field-guide.md](references/field-guide.md) when the task needs deeper loop, economy, progression, genre, accessibility, or research guidance.

## Choose the mode

### Greenfield

Before broad implementation, produce a vertical-slice contract: target player and session, observable player promise, pillars/anti-pillars, core decision, verb-feedback model, nested loops, resource flows, progression channels, failure/recovery, content grammar, and one falsifiable completion scenario. Build the smallest end-to-end slice that tests the riskiest assumption.

### Existing game

Reconstruct what the game actually does from code, catalogs, scene data, tests, and live play. Trace the first minute, first objective, representative session, and campaign/meta loop. Inventory mechanics only to find disconnected systems, repeated decisions, unused content, and accidental incentives. Rank root problems by player impact, confidence, reach, effort, and dependency.

“Improve with game design” is an implementation request. Do not stop at critique: select the highest-leverage coherent intervention, implement it through shared engine seams, and prove the changed player behavior.

## Required output contract

Make every design pass yield:

1. **Observed journey:** evidence-backed actions, decisions, feedback, state changes, friction, and dead time across relevant time horizons.
2. **North star:** one player promise, two or three observable pillars, anti-pillars, and the repeated decision the game is built around.
3. **Loop and flow model:** moment/encounter/session/meta loops plus resources, sources, conversions, gates, sinks, and feedback risks.
4. **Bottleneck ranking:** symptoms separated from root causes; cite the files, data, capture, or play evidence behind each claim.
5. **Intervention stack:** a minimum viable correction, a strong target, and later multipliers. Each names the behavior changed—not merely features added.
6. **Chosen design slice:** exact mechanics/content affected, shared owner, implementation files/data, tuning variables, migration risk, and explicit non-goals.
7. **Acceptance evidence:** deterministic rule tests, an observable play scenario, comprehension/choice/pacing thresholds, and before/after evidence.

## Execution rules

- Connect action -> simulation -> feedback -> learned model -> consequential future choice for every core verb.
- Make each loop return a changed world, resource, relationship, knowledge state, capability, or strategic context. An activity list is not a loop.
- Separate mastery, content access, expressive breadth, and numerical power. Prefer unlocks that change decisions over passive percentage inflation.
- Reward the behavior named by the pillars. Audit dominant strategies, grind, runaway feedback, fake choice, and telemetry proxies.
- Treat challenge as cognitive, motor, temporal, strategic, sensory, resource, punishment, and social dials—not one multiplier.
- Encode durable truth in catalogs/config, shared serializable systems, editor-owned scene data, and tests. Build reusable capability upstream.
- Cut breadth before weakening the core decision cycle. One excellent, replayable design slice is stronger evidence than ten disconnected systems.

## Completion

An audit is not completion for a build/improve request. Finish when the chosen slice is playable; a fresh target player can state the immediate goal, available choice, and consequence; failure and recovery behave as intended; the slice changes the next decision; and evidence supports or rejects the pillars. Use `jgengine-verify` and repository `workflow` to ship the result.
