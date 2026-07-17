---
name: level-design
description: Design, author, critique, and validate readable levels, worlds, encounters, navigation, and pacing.
---

# Level design

## Ownership

Own the spatial realization of game design: player metrics, topology, routes, landmarks, gates, encounter geometry, challenge sequencing, exploration, pacing, recovery, and spatial storytelling. Use `game-design` for the player promise and loops, `jgengine-editor` to author the space, and `jgengine-world` to consume it at runtime.

All authorable world content belongs in `editor.scene.json`, changed through the editor GUI or RPC/CLI. Never hand-edit the document or hardcode geometry, paths, spawns, zones, terrain, foliage, or coordinate arrays. If the editor cannot express the design, file a `[FEATURE]` issue before any code fallback.

## Level contract

Before authoring, state:

- player verbs, camera, controller metrics, encounter rules, and target skill assumptions
- the level's purpose, fantasy, entry state, exit state, and one-sentence experiential arc
- critical path, optional paths, gates, returns, landmarks, and expected traversal times
- beat sequence across navigational, cognitive, motor, threat, social, and emotional intensity
- teach/test/combine or other learning progression for every required mechanic
- failure/reset behavior, checkpoints, accessibility options, and multiplayer constraints
- observable completion scenario plus wayfinding, pacing, and exploit failure signals

Measure values from the real controller and camera; do not import genre folklore as universal dimensions. Use [references/field-guide.md](references/field-guide.md) for metric families, topology and beat methods, genre lenses, evaluation rubrics, and research sources.

## Workflow

1. **Prove mechanics first.** Measure speed, acceleration, stopping, turn radius, jump/reach, camera, interaction, weapon, AI, and network constraints in a small authored test space.
2. **Graph before geometry.** Sketch nodes and edges for goals, choices, loops, gates, one-way transitions, safe spaces, returns, and optional rewards. Give each branch a distinct decision or experience.
3. **Write the beat sheet.** Sequence orientation, anticipation, action, aftermath, choice, reward, and recovery. Vary intensity; constant maximum pressure erases contrast.
4. **Graybox in the editor.** Author semantic paths, markers, zones, terrain, and objects with stable ids. Establish scale, flow, sightlines, traversal, combat/interaction space, and reset paths before decoration.
5. **Teach through space.** Present information before commitment, permit safe experimentation, test the learned rule, then combine or transform it. Never demand a mechanic before the player could form the right model.
6. **Guide redundantly.** Align composition, landmarks, lighting/value, color, motion, audio, affordances, and path shape. HUD guidance may assist but cannot repair contradictory space.
7. **Compose encounters.** Define purpose, entry information, actors, geometry, resources, escalation, exits, and recovery. Check every viable player verb, not only the designer's route.
8. **Art and populate.** Add environmental story, rewards, foliage, materials, and assets only after the graybox survives fresh-player tests. Preserve gameplay silhouettes and authored semantics.
9. **Playtest and instrument.** Observe first-look orientation, route choice, hesitation, deaths, retries, missed affordances, objective recall, dwell time, spawn safety, and exploits. Test novice, experienced, accessibility, and multiplayer cohorts as applicable.
10. **Revise causally.** Diagnose whether the cause is information, geometry, timing, rule knowledge, execution load, tuning, or technical behavior. Change the smallest upstream cause and retest.

## Decision rules

- Offer choices at informed decision points, not indistinguishable corridors or branches with one dominant payoff.
- Preserve readable foreground, traversal boundaries, goals, threats, interactables, and safe footing across art passes.
- Separate pacing frequency from challenge amplitude; adaptive systems still need authored peaks, rests, and recovery guarantees.
- In multiplayer, validate route timing, objective access, spawn exposure, sightlines, team readability, comeback paths, and exploits across skill bands and player counts.
- Reward exploration with information, advantage, expression, story, or changed routes—not filler scattered uniformly across empty space.

## Completion

Finish only when a fresh player can orient, act, recover, and complete the target scenario without designer coaching; alternate routes and multiplayer states remain fair enough for their intent; the scene document owns the spatial truth; and `jgengine-verify` captures inspected visual and play evidence.
