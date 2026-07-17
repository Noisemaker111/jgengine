---
name: level-design
description: Design, audit, author, implement, and validate readable levels, worlds, encounters, navigation, and pacing.
---

# Level design

## Ownership

Own the spatial realization of game design: player metrics, topology, routes, landmarks, gates, encounter geometry, challenge sequencing, exploration, pacing, recovery, and spatial storytelling. Use `game-design` for the player promise and loops, `jgengine-editor` to author space, and `jgengine-world` to consume it.

All authorable world content belongs in `editor.scene.json`, changed through the editor GUI or RPC/CLI. Never hand-edit the document or keep geometry, paths, spawns, zones, objectives, terrain, foliage, encounters, or coordinate arrays in code. File an editor `[FEATURE]` issue before any fallback.

Read [references/application-playbook.md](references/application-playbook.md) whenever creating, auditing, or improving spatial play. Read [references/field-guide.md](references/field-guide.md) for metric families, topology, pacing, genre lenses, accessibility, and research.

## Choose the mode

### Greenfield

Measure the real controller, camera, interaction, combat, AI, and network constraints in an authored metric gym. Produce a topology graph, critical/optional route model, beat sheet, learning sequence, encounter cards, authoring plan, and falsifiable completion scenario before art production.

### Existing game

Start with a spatial-truth audit. Inventory every source of coordinates and semantics; report any gameplay placement outside `editor.scene.json` as a blocking ownership defect. Reconstruct the critical path and representative optional path from scene data and live play. Measure travel, decision, encounter, retry, and recovery time. Inspect first-look orientation, reverse navigation, affordances, spawn safety, combat positions, pacing contrast, and visual hierarchy.

“Improve with level design” is an authoring and implementation request. Do not stop at a map critique: select the highest-leverage route/zone/encounter slice, author the change through editor operations, connect runtime semantics, and prove it in play.

## Required output contract

Make every level-design pass yield:

1. **Spatial truth audit:** scene counts and semantic kinds plus every code-owned coordinate table, generated placement, or duplicated position that must migrate.
2. **Metric sheet:** measured movement, camera, interaction, weapon/AI, readability, density, performance, multiplayer, and retry constraints with units.
3. **Topology and journey:** nodes/edges, critical and optional routes, gates, returns, landmarks, expected traversal times, and first-minute/mission/campaign beats.
4. **Zone/encounter diagnosis:** purpose, entry knowledge/state, choices, geometry, actors, escalation, resources, exits, failure/reset, reward, and downstream change.
5. **Bottleneck ranking:** observed symptom, player consequence, root cause, evidence, reach, confidence, effort, dependencies, and ownership.
6. **Editor change set:** exact semantic ids/kinds and operations to add/move/remove for paths, markers, zones, spawns, objectives, checkpoints, props, and terrain—without putting coordinates in code.
7. **Acceptance evidence:** document assertions, route/encounter tests, fresh-player play scenario, pacing/wayfinding thresholds, inspected screenshots, and before/after comparison.

## Execution rules

- Graph before geometry; graybox before art; gameplay and wayfinding before decoration.
- Present decision-relevant information before commitment. Make alternate routes differ in risk, cost, verbs, information, reward, or experience.
- Sequence teaching through cue, safe use, feedback, independent test, combination, transformation, and mastery as the audience requires.
- Align composition, landmark, value/color, motion, audio, affordance, path shape, and optional UI guidance. No marker can repair contradictory space.
- Design pacing across separate threat, motor, cognitive, navigation, emotional, resource, and social axes. Constant pressure or empty traversal is not pacing.
- Make every encounter support intended verbs, counterplay, retreat, fair spawns, recovery, and bounded performance.
- Populate only after the graybox survives play. Preserve silhouettes, safe footing, goals, threats, interactables, teams, and traversal boundaries through art passes.

## Completion

An audit or prettier screenshot is not completion for a build/improve request. Finish when the scene document owns spatial truth; a fresh target player can orient, choose, act, recover, and complete the scenario without coaching; the route has intentional decisions and pacing; encounter exploits and alternate states are tested; and `jgengine-verify` records document, gameplay, and inspected visual evidence.
