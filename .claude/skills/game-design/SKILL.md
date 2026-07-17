---
name: game-design
description: Design, critique, and validate player experience, loops, systems, progression, and balance.
---

# Game design

## Ownership

Own the intended player experience and the rules that produce it: fantasy, pillars, verbs, decisions, feedback, nested loops, resources, progression, difficulty, failure, onboarding, retention, and social dynamics. Treat every design claim as a testable hypothesis, not a feature list or a promise that something will be "fun."

Route implementation after the design contract is coherent. Use `jgengine-gameplay` for serializable rules and progression, `jgengine-world` for spatial behavior and input, `jgengine-combat` for combat resolution, `jgengine-ui` for presentation, `level-design` for playable space, and `jgengine-multiplayer` for authority and transport.

## Design contract

Before implementation, state the smallest useful contract in task or issue notes; do not create a freestanding GDD:

- target players, play context, session shape, and accessibility assumptions
- one-sentence player promise phrased as what the player repeatedly does and feels
- two or three experience pillars plus explicit anti-pillars
- core verbs, information available before a choice, and perceivable consequences
- moment, encounter, session, and long-term loops; name the state each loop changes
- success, failure, recovery, stopping, and replay conditions
- one observable completion scenario and evidence that would falsify the design

Use [references/field-guide.md](references/field-guide.md) for the full design vocabulary, loop/economy/progression methods, genre lenses, and research sources.

## Workflow

1. **Start from experience.** Translate the pitch into observable player behavior and emotional intent. Check mechanics -> dynamics -> experience in both directions.
2. **Model learning and choice.** For each verb, connect action, simulation, feedback, learned model, future use, and counterplay. Remove choices that are blind, fake, or dominated.
3. **Draw nested loops.** Make every loop return a changed world, resource, relationship, knowledge state, or capability. An activity list is not a loop.
4. **Model flows.** List resources, sources, stores, converters, trades, gates, and sinks. Identify positive and negative feedback before tuning values.
5. **Shape progression.** Separate player mastery, content access, expressive breadth, and numerical power. Unlocks should alter decisions, not only inflate totals.
6. **Design failure and access.** Make setbacks legible and recovery proportionate. Treat challenge as separate cognitive, motor, temporal, strategic, sensory, and social dials.
7. **Prototype the riskiest loop.** Build the smallest end-to-end slice with real input and feedback. Prefer data tables and injected randomness so tuning remains inspectable.
8. **Test and revise.** Observe behavior before asking opinions. Classify findings as comprehension, execution, balance, pacing, motivation, accessibility, or technical defects; change one causal hypothesis at a time.
9. **Encode durable truth.** Put rules and tuning in catalogs/config, state in shared primitives, space in `editor.scene.json`, and acceptance in tests. Build reusable capability upstream before game-local fallback.

## Decision rules

- Preserve the intended experience when simplifying scope; cut breadth before the core decision cycle.
- Reward the behavior the game claims to value. Audit exploits, degenerate strategies, grind, runaway leaders, and reward schedules that replace intrinsic play.
- Never infer motivation from retention alone or optimize a telemetry proxy without qualitative evidence.
- Design multiplayer for join/leave, downtime, role value, information asymmetry, grief resistance, comeback shape, and different player counts from the start.
- Do not conceal an unclear rule behind UI copy, a shallow system behind progression, or an unreadable level behind objective markers.

## Completion

Finish only when the core loop is playable, a fresh player can state the immediate goal and consequence of their actions, the completion scenario works, failure recovers as intended, and evidence supports the pillars. Use `jgengine-verify` for play evidence and `workflow` for repository delivery.
