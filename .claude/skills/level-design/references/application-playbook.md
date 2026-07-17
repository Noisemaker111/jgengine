# Applying level design

Use this playbook to turn spatial intent or an existing world into editor-authored, playable change. Its purpose is to force concrete topology, authoring operations, and evidence rather than aesthetic commentary.

## Contents

1. Greenfield procedure
2. Existing-world audit
3. Spatial truth and metrics
4. Journey, topology, and beats
5. Zone and encounter diagnosis
6. Ranking interventions
7. Editor change set
8. Implementation and proof
9. Failure modes

## 1. Greenfield procedure

Before production art:

1. Import the game-design contract: promise, verbs, repeated decision, loops, target player, and completion proof.
2. Author a metric gym and measure the actual controller, camera, interaction, combat, AI, and network behavior.
3. Draw the topology graph with starts, goals, critical/optional routes, gates, returns, checkpoints, encounters, safe spaces, and rewards.
4. Write a beat sheet across threat, motor, cognitive, navigation, emotional, resource, and social intensity.
5. Map where each mechanic is cued, tried safely, tested, combined, transformed, and mastered.
6. Specify encounter cards and the semantic scene ids they require.
7. Graybox one route/zone slice in `editor.scene.json` through GUI or RPC/CLI.
8. Playtest orientation, decisions, traversal, encounter flow, failure, and retry before population and art.

## 2. Existing-world audit

### Inventory spatial truth

Inspect the editor document and source tree. Report separately:

- authored paths and point counts
- authored markers grouped by semantic kind and catalog id
- authored zones/volumes, terrain, foliage, annotations, prefabs, and collections
- gameplay spawns, objectives, NPCs, vendors, loot, checkpoints, gates, and encounters
- coordinate arrays, centers, offsets, radii, procedural placement, and duplicated positions in code
- runtime queries that consume stable scene ids/kinds

If gameplay placement exists in code but not the document, mark the spatial-truth audit failed before discussing polish. The repair is an editor-authored migration with stable semantics, not another adapter around coordinate tables.

### Observe live play

Capture and inspect:

- spawn/first frame and the first ten seconds
- first decision and first objective
- one critical-path transition
- one representative encounter and retry
- one optional route/POI
- reverse travel or return after state change
- a dense/peak gameplay frame

Record what dominates the frame, what the player can infer, where they look, where they move, what they miss, and whether UI/world cues agree. Pixel metrics only reject technical blanks; human inspection judges composition and gameplay readability.

## 3. Spatial truth and metrics

### Metric sheet

| Family | Measured values | Source/build | Design consequence | Extreme/accessibility case |
| --- | --- | --- | --- | --- |
| movement | speed, acceleration, stop, turn, jump, slope, radius | | | |
| camera | perspective, FOV, offset, obstruction, sensitivity | | | |
| interaction | range, use time, target clarity | | | |
| combat/AI | weapon bands, projectile time, sensing, attack, group size | | | |
| navigation | path width, sightline, branch/rejoin, landmark range | | | |
| pacing | time to action, encounter, rest, reward, retry | | | |
| multiplayer | spawn, regroup, revive, latency, count | | | |
| performance | actor/object density, nav, draw, simulation | | | |

Derive dimensions from the measured game. Never paste corridor, cover, jump, or arena numbers from another title.

### Travel-time audit

Measure each route at the actual movement speed, including turns, hazards, encounters, and interaction delay. For every interval, classify the intended value: decision, mastery, anticipation, story, resource planning, combat, exploration, recovery, or deliberate atmosphere. Empty time with no purpose is a pacing defect even when the scenery is attractive.

## 4. Journey, topology, and beats

### Topology table

| Node/edge | Purpose | Entry information | Choice/tradeoff | Gate/return | Expected time | Downstream change |
| --- | --- | --- | --- | --- | --- | --- |

Validate reachability for relevant quest/world states and the reverse direction. Branches must differ in risk, cost, verb, information, reward, story, or experience.

### Beat sheet

| Time/distance | Beat | Threat | Motor | Cognitive | Navigation | Emotion/resource | Evidence/failure signal |
| --- | --- | --- | --- | --- | --- | --- | --- |

Look for long flats, constant peaks, unseen goals, repeated rhythms, rewards without anticipation, combat without aftermath, and failure without fast useful retry.

### First-minute contract

The first minute must deliberately answer:

- Where am I and what fantasy am I inhabiting?
- What can I do now?
- What should I notice first?
- What is my immediate goal and why?
- Where is the first safe experiment?
- What consequence teaches the rule?
- What next decision promises depth?

Do not answer all seven with text. Use space, action, feedback, and only the necessary UI.

## 5. Zone and encounter diagnosis

### Zone card

- role in the game/session loop
- visual/spatial identity and landmark hierarchy
- entry/exit states and critical/optional routes
- mechanics introduced, tested, combined, and mastered
- decision types and exploration rewards
- pacing arc, safe spaces, checkpoints, and return value
- content budget and performance peak
- spatial story and world-state change

Zones that differ only by palette, enemy level, or kill quota do not provide meaningful progression.

### Encounter card

- purpose and target player behavior
- entry sightline, knowledge, position, resources, and condition
- initial decision and viable approaches
- geometry for every intended verb and counterplay
- actors/hazards, escalation, reinforcement, peak, and resolution
- cover/refuge, retreat, flank, exits, and exploit risks
- reward, failure/reset, retry time, and downstream state change
- semantic scene ids and performance budget

## 6. Ranking interventions

Rank candidate changes with evidence:

| Candidate | Player behavior changed | Reach | Evidence/confidence | Effort/risk | Dependencies | Editor/runtime owner |
| --- | --- | --- | --- | --- | --- | --- |

Use three horizons:

- **Minimum correction:** migrate invalid spatial ownership or repair a blocking orientation/flow failure.
- **Strong target:** make one representative route/zone/encounter deliver the intended promise end to end.
- **Multiplier:** propagate the proven spatial grammar, semantic kinds, encounter kit, and tests across the world.

Prioritize upstream seams and reusable authoring kinds. Do not spend the first pass scattering props across a structurally unchanged map.

## 7. Editor change set

Specify operations semantically, not as code coordinates:

| Operation | Stable id/kind | Purpose/meta | Runtime consumer | Acceptance |
| --- | --- | --- | --- | --- |
| add/move/remove path | | from/to, route role | | |
| add/move/remove marker | | spawn/objective/NPC/checkpoint/landmark | | |
| add/move/remove zone | | encounter/settlement/safe/gate/resource | | |
| terrain/foliage/material pass | | traversal/readability/identity | | |
| prop/asset pass | | cover/affordance/story/landmark | | |

Execute through `jgengine-editor`. Gameplay code queries ids, kinds, layers, and metadata; it does not receive copied positions. File an editor feature issue if a required semantic kind or operation does not exist.

## 8. Implementation and proof

When the user asks to build or improve:

1. Establish before evidence and the acceptance scenario.
2. Author the chosen graybox and semantics through the editor.
3. Connect shared runtime/gameplay primitives to the authored ids.
4. Migrate superseded coordinate tables without changing unrelated content.
5. Add document assertions for required paths, zones, markers, and ids.
6. Add deterministic route, encounter, reset, and state-transition tests.
7. Run a fresh-player or representative play scenario.
8. Capture and inspect the same views before/after.
9. Evaluate timing, choice, comprehension, exploit, accessibility, and performance falsifiers.

Evidence should answer the design claim. Scene counts prove ownership, headless tests prove state, a driven playtest proves progress, and inspected screenshots prove visible composition. No one rung proves all four.

## 9. Failure modes

- praising asset count while gameplay semantics remain in code
- drawing a map without measuring the real controller/camera
- calling multiple corridors meaningful choice
- filling empty travel with collectibles instead of decisions or pacing
- changing color/lighting while topology and encounter flow remain unchanged
- using objective markers to compensate for contradictory geometry
- designing only the critical path or only the plan view
- making every zone the same objective with new enemies and palette
- reporting an audit after the user asked for improvement
- claiming success from scene counts, tests, telemetry, or screenshots alone
