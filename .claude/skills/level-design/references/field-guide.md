# Level design field guide

Use this reference for spatial planning, authoring, critique, and playtest diagnosis. It synthesizes research and production talks into adaptable tools. There are no universal corridor widths, jump gaps, cover intervals, or pacing curves: derive them from the actual game, camera, controller, opponents, audience, and performance budget.

## Contents

1. Spatial design contract
2. Metrics and test spaces
3. Topology and spatial grammar
4. Beats, pacing, and learning
5. Wayfinding and readability
6. Encounters and challenge spaces
7. Nonlinearity, exploration, and world structure
8. Genre lenses
9. Multiplayer spaces
10. Accessibility and comfort
11. JGengine authoring passes
12. Playtesting and evidence
13. Diagnostic checklist
14. Research basis

## 1. Spatial design contract

Translate the game-design contract into a one-level hypothesis:

| Concern | Question |
| --- | --- |
| purpose | What skill, choice, story beat, resource change, or social behavior exists because of this level? |
| entry | What does the player know, possess, expect, and see on arrival? |
| arc | How should orientation, pressure, discovery, mastery, and recovery change over time? |
| exit | What state and understanding should the player carry forward? |
| topology | What is critical, optional, gated, reversible, looping, or one-way? |
| constraints | What camera, movement, AI, combat, streaming, multiplayer, and accessibility facts bound the space? |
| proof | What will a fresh player do if the level works, and what observations would disprove it? |

Every space spends production and player attention. Give traversal, vistas, safe rooms, side paths, and empty space a purpose; atmosphere and anticipation are valid purposes when their duration supports the arc.

## 2. Metrics and test spaces

### Measure the real game

Author a compact metric gym in the editor. Measure at normal and extreme settings:

- walk, sprint, crouch, vehicle, climb, swim, and air speeds
- acceleration, deceleration, turn radius, strafe behavior, and input latency
- avatar radius/height, step height, slope limit, clearance, and camera offset/FOV
- jump height, time aloft, horizontal reach, forgiveness, ledge grab, and fall recovery
- interaction distance, target acquisition, use duration, and readable feedback range
- weapon/effect ranges, spread, travel time, damage falloff, reload, and cover exposure
- AI sensing, pursuit, attack, group size, navigation footprint, and disengage/reset behavior
- objective readability distance, audio cue range, and UI assistance behavior
- multiplayer latency assumptions, team size, spawn delay, revive range, and regroup time
- frame, draw, navigation, simulation, and streaming budgets at the densest intended moment

Record units and evidence. Derive spatial values from combinations: traversal distance from speed and desired travel time; arena depth from weapon bands and mobility; landing area from jump variance and camera visibility.

### Metric families

Track ranges rather than magic constants:

- minimum comfortable, standard, and mastery traversal widths
- safe, pressured, and impossible reaction distances
- intimate, tactical, navigational, and landmark sightline bands
- time from spawn/checkpoint to meaningful action
- time and distance from failure to retry
- branch divergence and rejoin time
- cover/exposure rhythm and flank travel time
- choke throughput and escape capacity for expected actors
- clue-to-commitment distance at each decision point

## 3. Topology and spatial grammar

### Draw a graph first

Represent the level as nodes and directed edges before detailed geometry. Annotate:

- start, goals, exits, checkpoints, safe spaces, peaks, and rewards
- critical and optional paths
- locks, keys, ability gates, resource gates, soft gates, and knowledge gates
- one-way drops, shortcuts, loops, returns, teleports, and failure resets
- decision points and information available before commitment
- enemy, hazard, objective, resource, and social pressure zones
- visibility, audibility, and foreshadowing across non-adjacent nodes

Check reachability for every valid state. Check the return route after objectives, not only the approach. A branch should change risk, information, cost, verb use, story, or experience; geometry alone does not create meaningful choice.

### Compose space deliberately

Use contrast to make places legible and memorable:

- compression -> threshold -> release
- exposure -> refuge -> re-entry
- low -> high, narrow -> broad, dark -> bright, quiet -> loud
- concealed approach -> reveal -> understood destination
- path -> edge -> district -> node -> landmark relationships

Preserve silhouettes and negative space. Repetition teaches a visual/spatial grammar; variation creates interest only while the grammar remains recognizable.

### Respect camera and viewpoint

Design what the player can perceive, not only the plan view. Validate corners, slopes, doors, stairs, jumps, cover, targets, and landmarks from the actual camera at gameplay speed. Third-person cameras need obstruction and shoulder-space checks; first-person spaces need motion/scale checks; top-down spaces need silhouette separation and input target clarity.

## 4. Beats, pacing, and learning

### Write a beat sheet

Useful beat types include arrival, orientation, foreshadowing, approach, choice, commitment, engagement, escalation, reversal, climax, aftermath, reward, reflection, and recovery. Record duration or distance plus separate intensity estimates for:

- threat/resource pressure
- motor precision and timing
- cognitive load and novelty
- navigation uncertainty
- emotional/narrative weight
- social coordination

Graph the axes. Avoid treating all intensity as one number: a quiet navigation puzzle can be cognitively intense while physically calm.

Create waves and contrast. Sustained peak pressure becomes a new baseline and prevents reflection. Fixed authored beats can coexist with adaptive population or pacing systems, but protect landmark encounters, guaranteed rests, and minimum recovery windows.

### Sequence learning

For each required mechanic:

1. signal the opportunity before punishment
2. isolate the mechanic in a low-cost situation
3. let the player act and see a clear consequence
4. test independent use
5. combine it with one mastered demand
6. vary context or invert an assumption
7. provide a mastery application and later recall

This is a diagnostic progression, not a mandatory number of rooms. Skip, compress, or branch based on target players and observed mastery. Never confuse obscurity with difficulty.

## 5. Wayfinding and readability

### Build an information hierarchy

At a glance, players should distinguish:

1. immediate hazards and safe footing
2. interactables, opponents, allies, and objectives
3. current route choices and traversal boundaries
4. distant goals, districts, and optional opportunities
5. decorative context

Use multiple aligned channels:

- framing, leading edges, occlusion/reveal, and dominant silhouettes
- light/value contrast and restrained color coding
- motion, particles, animation, and population flow
- audio direction, rhythm, and environmental sound
- material, shape, scale, signage, and repeated affordance language
- vistas, landmarks, breadcrumbs, path wear, and environmental change

Do not make critical meaning depend on color or audio alone. Decorative contrast must not compete with gameplay signals.

### Design decision points

Before commitment, show enough of each choice to form an intention: destination, risk, cost, verb requirement, or likely reward. After commitment, confirm the route and preserve a mental link to origin. Make return paths readable from the reverse direction; a one-way composition often fails backward.

Layer navigation assistance: spatial cues first, optional map/compass/objective aids second, explicit route guidance when requested or required for access. If every tester follows a marker while ignoring the world, test without it to expose the spatial problem.

## 6. Encounters and challenge spaces

### Write an encounter card

- purpose in the level arc
- player entry position, knowledge, resources, and likely condition
- enemies/hazards/objectives and their readable introduction
- geometry supporting each core verb and counterplay
- initial choice, escalation trigger, reinforcement rules, and peak
- resources, cover/refuge, exits, retreat, and alternate approaches
- success/failure state, reset, reward, and downstream consequence
- expected duration, intensity axes, and performance budget

### Spatial combat checks

- sightlines match weapon and perception ranges
- cover has readable protection, exposure, flanking, and escape relationships
- vertical advantage has counters and does not hide essential information
- enemy entrances are foreshadowed and do not feel like arbitrary materialization
- spawn locations avoid immediate unavoidable damage and repeated trapping
- the arena supports movement instead of collapsing every fight into one safe corner
- retreat and recovery do not accidentally reset or exploit the whole encounter
- resource placement changes decisions rather than merely refilling after them

For stealth, model visibility, audibility, patrol information, hiding capacity, bypasses, alarm propagation, search, and recovery. For puzzles, model known facts, manipulable state, hypothesis space, feedback, undo/reset, and whether failure adds information.

## 7. Nonlinearity, exploration, and world structure

Use hubs, loops, braided paths, spokes, layered spaces, or open fields according to the verbs and orientation burden. More branches do not automatically create agency.

Distinct routes can trade:

- speed versus safety
- information versus resources
- execution difficulty versus planning complexity
- stealth versus confrontation
- immediate reward versus future access
- authored story versus systemic discovery
- solo efficiency versus group support

Reward exploration with knowledge, tactical position, shortcuts, expressive content, systemic advantage, story, resources with real use, or a changed understanding of the world. Uniform collectibles turn discovery into coverage work.

Control density. Leave room for anticipation, long views, traversal mastery, and ecological/narrative coherence. Revisit value rises when routes unlock, world state changes, new verbs reinterpret old obstacles, or return travel is meaningfully compressed.

## 8. Genre lenses

### Platforming and traversal

Prioritize landing visibility, input commitment, correction windows, camera stability, readable collision, consequence, restart speed, and progression from isolated movement to chained decisions. Optional mastery routes can carry tighter metrics without blocking the critical path.

### Racing and vehicles

Design sight distance from speed and braking, corners from handling and camera, passing from route width and line tradeoffs, recovery from crash cost, and landmarks from rapid recognition. Validate reverse/off-course behavior and vehicle congestion.

### Puzzle

Separate discovering the rule from executing it. Present sufficient information, minimize irrelevant state, keep causality visible, support undo/reset, and test whether hints preserve the player's final inference. Combine mechanics only after their individual language is learned.

### Survival and horror

Use incomplete information deliberately but keep rules trustworthy. Space controls vulnerability, refuge, resource forecasting, pursuit, and route commitment. Alternate anticipation, exposure, consequence, and relief; random pressure still needs fairness constraints.

### Strategy, tactics, and defense

Make territory, ranges, lanes, objectives, buildable areas, influence, and path consequences legible from the command view. Check dominant positions, stalled states, path manipulation, economy access, and whether early advantage becomes irreversible.

### Exploration and narrative

Let navigation itself reveal relationships, history, and choice. Align story beats with movement and attention rather than competing exposition. Optional spaces should deepen context or play, not contain the explanation required to understand the critical path.

## 9. Multiplayer spaces

Symmetry guarantees sameness, not balance; asymmetry can be fair when route time, information, objectives, roles, and counterplay support the intended mode. Measure from every spawn and team state.

Validate:

- time to first choice, first contact, objective, power position, and regroup
- spawn visibility, nearby threats, exits, ally access, and repeat-kill risk
- lane and flank value, rotation time, choke capacity, and sightline dominance
- objective approach diversity, defense depth, contest readability, and overtime state
- callout landmarks and team-color/accessibility readability
- player-count scaling, uneven teams, join-in-progress, spectators, and disconnects
- novice traffic versus expert routes; both cohorts can expose different failures
- exploits involving geometry, camera, collision, projectiles, AI, or destruction

Use heatmaps and outcome data to locate questions, then watch matches to explain them. A 50% win rate can conceal miserable spawns or a dominant strategy mirrored by both teams.

## 10. Accessibility and comfort

Treat navigation, challenge, and sensory load as adjustable dimensions:

- communicate objectives and progress without requiring memory alone
- offer map, breadcrumb, high-contrast, audio/visual cue, and route-assist options
- avoid color-only teams, routes, hazards, or puzzle state
- provide timing, precision, damage, resource, puzzle, and navigation assists separately
- reduce repeated travel and execution after demonstrated mastery
- support pause where topology permits and provide safe stopping points
- validate motion, camera acceleration, head bob, FOV, flashing, visual clutter, and audio dependence
- make shortcuts, skips, and recovery usable without stigma or lost progress

Accessibility options can preserve fantasy while changing the barrier. Test with affected players rather than guessing from a checklist.

## 11. JGengine authoring passes

Use `jgengine-editor` GUI or RPC/CLI for every pass; never hand-edit `editor.scene.json`.

1. **Metrics:** author the movement/camera/interaction test space.
2. **Topology:** place stable semantic markers, zones, paths, starts, goals, gates, and checkpoints.
3. **Graybox:** establish terrain, boundaries, traversal, sightlines, encounter volume, and reset routes.
4. **Gameplay:** bind systems to authored ids/kinds; keep coordinates in the document.
5. **Wayfinding:** add landmarks, composition, lighting/material hierarchy, signage, and redundant cues.
6. **Population:** place actors, resources, hazards, rewards, foliage, and props with budget awareness.
7. **Art:** refine materials, asset variation, environmental story, and atmosphere without erasing readability.
8. **Optimization:** validate dense views, navigation, collision, instancing, streaming, and bounded runtime queries.

Use stable names such as `spawn:*`, `goal:*`, `route:*`, `zone:*`, or project-specific semantic kinds consistently. Runtime and tests query semantics; they do not duplicate positions. If an authoring kind is missing, file the editor feature issue first.

## 12. Playtesting and evidence

### Test in layers

- **metric test:** can the controller perform intended movement reliably?
- **first-look test:** where does a fresh player look and go before prompting?
- **route test:** what choices, reversals, loops, and missed paths occur?
- **encounter test:** what positions, verbs, resources, failures, and exploits dominate?
- **pacing test:** where do hesitation, fatigue, pressure, relief, and payoff occur?
- **return test:** can players navigate backward or after world-state changes?
- **accessibility test:** which sensory, motor, cognitive, or timing barriers are avoidable?
- **multiplayer test:** how do skill, team state, count, latency, and social behavior alter flow?

Capture build/version, player profile, timestamps, path/position samples, deaths/damage, retries, objective state, interaction failures, camera direction at decisions, dwell, resource state, and completion time only when they answer a design question.

Watch without coaching. Ask afterward what the player believed the goal, rule, route, risk, and consequence were. Diagnose the smallest upstream cause:

- missing or competing information
- misleading affordance or composition
- bad geometry/metrics
- mechanic not learned
- execution burden
- encounter or economy tuning
- reset/recovery friction
- runtime bug

Change one causal variable, preserve before/after evidence, and retest. A polished screenshot proves composition, not playability; a scene summary proves authored presence, not visual quality.

## 13. Diagnostic checklist

- Does the level serve a named loop, pillar, skill, or story purpose?
- Are dimensions derived from measured controller, camera, actor, and network behavior?
- Can players see enough to choose before commitment?
- Does every required mechanic appear before it is demanded?
- Are critical path, optional paths, return routes, and reset routes all valid?
- Do beats vary across separate intensity axes and include recovery?
- Do art, lighting, audio, and UI reinforce rather than contradict spatial guidance?
- Does every encounter support intended verbs, counterplay, retreat, and fair recovery?
- Are exploration rewards meaningful and route choices distinct?
- Are objectives, hazards, footing, interactables, and teams readable without one sensory channel?
- Do multiplayer spawns, timings, objectives, and power positions survive different skill bands and counts?
- Does `editor.scene.json` remain the sole source of authored spatial truth?
- Has a fresh target player completed the scenario without designer coaching?

## 14. Research basis

- David Shaver and Robert Yang, GDC [“Invisible Intuition”](https://www.gdcvault.com/play/1025360/Level-): blockmesh, composition, light, effects, audio, and early tests as aligned wayfinding channels.
- Jane Ng, GDC [“Designing for Exploration and Choice in Firewatch”](https://www.gdcvault.com/play/1022409/Designing-for-Exploration-and-Choice): world structure, goals, gating, and encounter thinking for non-combat exploration.
- Matt Thorson, GDC [“Designing Celeste”](https://www.gdcvault.com/play/1024307/Level-Design-Workshop-Designing-Celeste): movement-driven stages, area arrangement, progression, and story integration.
- Mike Booth / Valve, [“The AI Systems of Left 4 Dead”](https://steamcdn-a.akamaihd.net/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf): measure player intensity and separate adaptive pacing frequency from difficulty amplitude.
- Jolie Menzel, GDC [“Solving Puzzle Design”](https://www.gdcvault.com/play/1023139/Level-): information, goals, teaching, iteration, and frustration diagnosis in spatial puzzles.
- Andrew Yoder, GDC [“The Holy Grail of Multiplayer Level Design”](https://gdcvault.com/play/1025183/Level-Design-Workshop-The-Holy): test graybox maps with casual and competitive cohorts and combine data with observation.
- Clemence Maurer, GDC [“Rewarding Exploration in Deus Ex: Mankind Divided”](https://gdcvault.com/play/1024305/Level-Design-Workshop-Rewarding-Exploration): connect optional navigation, systemic advantage, world coherence, and environmental story.
- Dave Feltham, GDC [“Emotional Journey”](https://gdcvault.com/play/1018166/Emotional-Journey-BioWare-s-Methods): use measured level pacing and flow to reinforce narrative arcs.
- Matthias Worch, GDC [“Decisions That Matter”](https://gdcvault.com/play/1020570/): informed spatial choices, consequences, possibility space, and agency.
- Brendon Chung, GDC [“Wayfinding & Storytelling Techniques”](https://www.gdcvault.com/play/1022117/level-design-in-a-day): architecture, navigation, environmental information, and common wayfinding failures.
- Luke McMillan, [“The Metrics of Space”](https://www.gamedeveloper.com/design/the-metrics-of-space-tactical-level-design): derive tactical space from viewpoint, awareness, and gameplay metrics rather than decoration.
- Microsoft, [Xbox Accessibility Guidelines](https://learn.microsoft.com/en-us/xbox/accessibility/guidelines): objective clarity, input, object readability, redundant cues, timing, challenge options, and sensory comfort.
