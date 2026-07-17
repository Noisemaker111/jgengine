# Game design field guide

Use this reference when a task needs more than the canonical workflow in [`SKILL.md`](../SKILL.md). It is a synthesis of research and shipped-game practice, not a universal formula. Select the tools that expose the current design risk and validate them with players.

## Contents

1. Experience hypotheses
2. Actions, feedback, and decisions
3. Nested loops
4. Systems and economies
5. Progression and challenge
6. Onboarding and accessibility
7. Multiplayer and social play
8. Content structure and genre lenses
9. Prototyping and playtesting
10. JGengine translation
11. Diagnostic questions
12. Research basis

## 1. Experience hypotheses

### Write a working contract

Use a compact table in the issue, task, or conversation. Do not preserve speculative prose as a large design document.

| Question | Useful answer | Weak answer |
| --- | --- | --- |
| Who plays, where, and for how long? | “Two friends, 20-minute online co-op runs” | “Everyone” |
| What do they repeatedly do? | “Scout, plan a breach, improvise when it fails” | “Experience action” |
| What should dominate the experience? | “Tense coordination, expressive tools, recoverable chaos” | “Fun and immersive” |
| What must it not become? | “Inventory chores, solved loadouts, long spectator time” | “Not boring” |
| What proves the loop? | “A new pair completes one objective, explains its failure, and chooses a different second approach” | “Players like it” |

Treat pillars as prioritization constraints. Make each pillar observable and give it an anti-pillar. When two features conflict, the pillar decides which survives.

### Trace experience in both directions

Use the Mechanics-Dynamics-Aesthetics separation as a causal check:

- **Experience:** the intended emotional or social response.
- **Dynamics:** the behavior that should emerge during play.
- **Mechanics:** the rules, data, controls, and feedback likely to produce that behavior.

Design backward from experience, then simulate forward from mechanics. A stealth meter does not guarantee tension; examine whether information, enemy response, recovery, and level geometry actually produce cautious planning.

Use autonomy, competence, and relatedness as diagnostics, not mandatory quotas:

- **Autonomy:** choices allow ownership and expression rather than cosmetic branching.
- **Competence:** players can understand improvement and attribute outcomes to actions.
- **Relatedness:** players can contribute, recognize others, and form meaningful social context.

## 2. Actions, feedback, and decisions

### Model a playable verb

For every core verb, specify:

1. cue and available information
2. player intention and input
3. target and eligibility rules
4. simulation/state transition
5. immediate visual, audio, haptic, and systemic feedback
6. consequence that affects a later choice
7. skill the player is expected to learn
8. counterplay, cost, risk, or limitation

An animation without a state consequence is presentation. A state change the player cannot perceive cannot reliably teach. Good moment-to-moment feel combines predictable physical response, amplified event importance, and assistance that honors player intention.

### Test whether a choice is meaningful

A decision usually needs:

- at least two viable options the player can distinguish
- enough information to form a plan, with uncertainty appropriate to the fantasy
- a tradeoff rather than a universally dominant answer
- a perceivable consequence at the promised time scale
- an effect on future state, knowledge, position, relationships, or opportunity

Not every input needs strategic depth. Execution, expression, discovery, role-play, and timing can carry play. Be precise about which kind of agency the design promises.

Audit common choice failures:

- **blind:** relevant information arrives only after commitment
- **fake:** outcomes converge without expressive or narrative value
- **solved:** one option dominates across contexts
- **noisy:** feedback cannot be attributed to the choice
- **overloaded:** too many new variables must be evaluated at once
- **inert:** consequence does not alter anything the player values

## 3. Nested loops

### Loop anatomy

Write each loop as:

`state/cue -> goal -> informed action -> simulation -> feedback -> changed state -> next decision`

The return state must differ in a useful way: new information, depleted or gained resources, changed position, higher mastery, altered relationships, new capability, or escalated world state. “Fight enemies, get loot, repeat” is incomplete until the design explains how loot changes subsequent fights and why choices remain interesting.

### Time horizons

| Horizon | Typical concern | Validation |
| --- | --- | --- |
| moment-to-moment | control, targeting, timing, feedback | Can players predict and correct an action? |
| encounter/task | tactics, puzzle, risk, recovery | Do multiple verbs and resources create decisions? |
| session/run | pacing, goals, build arc, stopping | Does the session reach a satisfying change or climax? |
| campaign/meta | progression, variety, mastery, expression | Do unlocks create new play instead of only larger numbers? |
| community | cooperation, competition, identity, shared stories | Can players contribute and recover from social friction? |

Check coupling. The short loop must feed the long loop, and long-loop rewards must renew rather than trivialize the short loop.

## 4. Systems and economies

### Map flows before tuning

For every tangible or abstract resource, record:

- **source:** creates it
- **pool/store:** holds it and defines capacity or decay
- **converter:** changes it into another resource or state
- **trade:** exchanges resources between owners
- **gate:** requires a threshold or condition
- **sink:** removes it from circulation

Include time, attention, space, health, information, social trust, action opportunities, and risk when they behave like resources. Draw connections and simulate several player strategies before choosing numbers.

### Audit feedback structures

- Positive feedback amplifies an advantage; it can make growth satisfying but also cause runaway leaders.
- Negative feedback resists deviation; it can stabilize play but feel punitive when it erases earned advantage.
- A loop’s speed, delay, visibility, durability, and cap matter as much as its sign.
- Randomness changes distribution, not only average outcome. Examine worst cases, streaks, and player control.

Give resources clear jobs. A currency with no recurring sink accumulates into irrelevance; a sink without valued outcomes becomes tax. Use opportunity costs to create decisions, and cap or decay stockpiles only when that behavior supports the experience.

### Balance relationships, not isolated values

Maintain a tuning table with units, baseline, min/max, dependency, player-facing purpose, and test evidence. Derive related values from a small set of legible baselines. Inspect:

- time-to-effect and time-to-recover
- expected value and variance
- throughput, capacity, scarcity, and replacement rate
- breakpoints where an option changes from viable to dominant
- compounding across upgrades and feedback loops
- edge cases at zero, maximum, and repeated use

## 5. Progression and challenge

### Separate progression channels

- **Mastery:** the player learns execution, planning, recognition, or social coordination.
- **Content:** new spaces, problems, opponents, or stories become available.
- **Breadth:** new tools or combinations expand the possibility space.
- **Power:** existing actions become numerically stronger.
- **Expression/status:** appearance, identity, collection, or public accomplishment changes.

Prefer unlocks that create new decisions or recontextualize mastered skills. Numerical power is useful when it makes growth legible, but unchecked vertical scaling invalidates content and narrows viable options.

Build a skill graph: assumed prior skills -> introduced skill -> safe practice -> independent test -> combination -> transformed use -> mastery proof. Provide fast paths or optional refreshers for players who arrive with different prior knowledge.

### Treat difficulty as a vector

Tune cognitive load, precision, timing, planning depth, memory, sensory discrimination, resource pressure, punishment, uncertainty, coordination, and persistence separately. A single easy/normal/hard multiplier cannot serve every barrier.

Failure should answer:

- What happened and why?
- What can the player try differently?
- How much meaningful progress is lost?
- How quickly can the player act again?
- Does recovery preserve tension without demanding repetition already mastered?

Dynamic adjustment can change pressure frequency, assistance, resource supply, or challenge amplitude, but it must remain predictable enough for players to learn and must not counterfeit achievement.

## 6. Onboarding and accessibility

Teach inside representative play:

1. prime attention before the mechanic matters
2. invite the action with low failure cost
3. give immediate, redundant feedback
4. allow repetition or experimentation
5. test without step-by-step prompting
6. combine with one known mechanic
7. make help recallable and skippable where appropriate

Do not assume genre literacy, dual-stick control, rapid reading, color discrimination, precise timing, hearing, or uninterrupted attention. Preserve the intended experience through remapping, simplified input, adjustable timing, pause, granular challenge assists, redundant cues, readable objectives, and reduced repetition.

## 7. Multiplayer and social play

Design the social system before selecting transport:

- define cooperative and competitive relationships, team sizes, and information boundaries
- ensure every role has understandable contribution and moments of agency
- limit involuntary downtime and give eliminated players meaningful next actions
- specify join, leave, disconnect, reconnect, and uneven-player behavior
- distinguish team comeback from hidden punishment of skilled play
- bound griefing, collusion, kingmaking, smurfing, spawn abuse, and reward farming
- test communication-light play and accessibility of coordination signals

For persistent systems, model inflation, hoarding, market manipulation, time-zone advantage, seasonal resets, and what happens when population is sparse.

## 8. Content structure and genre lenses

Create a content matrix from mechanics and contexts rather than brainstorming isolated features. Useful axes include verb, target, constraint, topology, information state, resource state, opponent behavior, time pressure, social relationship, and consequence. Combine a few axes at a time and reserve unexplored combinations for progression.

Apply genre lenses without treating them as templates:

- **action/combat:** readability, positioning, threat priority, counterplay, recovery, expressive kit
- **platforming/racing:** movement mastery, line choice, anticipation, risk, restart cost, readable boundaries
- **puzzle:** information sufficiency, hypothesis formation, state legibility, undo/reset, insight rather than busywork
- **strategy/management:** forecasts, opportunity cost, feedback loops, viable plans, recovery from early errors
- **survival/crafting:** scarcity rhythms, transformation chains, expedition risk, homeward payoff, anti-grind
- **narrative/social:** role expression, relationship consequences, authored versus emergent story, respectful irreversibility
- **sandbox/open world:** self-directed goals, systemic interaction, discovery density, world response, return value

## 9. Prototyping and playtesting

### Prototype risk, not polish

Name the riskiest assumption: control feel, decision depth, loop renewal, economy stability, social coordination, or content feasibility. Build the smallest slice that can disprove it with real input, real state transitions, and representative feedback.

### Use a test protocol

Record:

- hypothesis and decision the test will inform
- participant profile and prior skills
- build/version, scenario, starting state, and task
- observable success/failure thresholds
- events and metrics to capture
- moderator script that avoids teaching or defending the design
- findings separated into behavior, interpretation, severity, confidence, and proposed cause

Observe before interviewing. Ask players what they thought was happening, what they planned, and what evidence shaped the plan. Preferences are valuable but do not replace behavior. Telemetry describes what happened at scale; it rarely explains why.

Use rapid iterative testing for obvious, high-confidence usability defects: make a small fix, test it with the next appropriate participant, and verify that it solves the problem without creating another. Do not churn balance or appeal based on one participant.

Classify findings:

- **comprehension:** goal, rule, state, or feedback misunderstood
- **execution:** intention clear but control/precision/timing blocks action
- **balance:** options or outcomes violate intended tradeoffs
- **pacing:** pressure, rest, novelty, or payoff arrives at the wrong rate
- **motivation:** player sees no valued reason to continue
- **accessibility:** an avoidable barrier excludes a player
- **technical:** implementation differs from the design contract

## 10. JGengine translation

- Keep the design contract and acceptance criteria in the tracked issue/PR, not a speculative document tree.
- Put definitions, costs, rewards, tiers, recipes, and formulas in typed catalogs or config.
- Put mutable state in serializable shared primitives and transitions in systems/commands.
- Put placement, routes, terrain, markers, zones, foliage, and asset instances in `editor.scene.json` via `jgengine-editor`.
- Query authored ids and semantics through `jgengine-world`; never copy coordinates into rules.
- Use deterministic injected randomness and headless tests for loops, economies, and failure states.
- Add telemetry only for a named design question and avoid collecting unnecessary player data.
- If a reusable rule is missing, implement the narrow package primitive with the game as first adopter.

## 11. Diagnostic questions

Before calling a design coherent, ask:

- Can a player state the immediate goal, available verbs, and likely consequences?
- What interesting decision repeats, and how does context stop it becoming solved?
- What does the player learn in the first minute, first session, and tenth session?
- Which state changes make each loop worth repeating?
- What behavior does each reward actually incentivize?
- Where can positive feedback create a runaway result?
- Which barriers are intentional challenge and which are accidental exclusion?
- What happens after failure, success, mastery, interruption, and return?
- What breaks with one player, the maximum player count, or a disconnect?
- What evidence would cause the team to remove or redesign the feature?

## 12. Research basis

These sources provide lenses and evidence, not commandments:

- Robin Hunicke, Marc LeBlanc, and Robert Zubek, [“MDA: A Formal Approach to Game Design and Game Research”](https://users.cs.northwestern.edu/~hunicke/MDA.pdf): trace mechanics, runtime dynamics, and intended experience causally and avoid using “fun” as the whole vocabulary.
- Richard Ryan and collaborators, [Player Experience of Needs Satisfaction](https://selfdeterminationtheory.org/player-experience-of-needs-satisfaction-pens/): empirical motivation lens around autonomy, competence, and relatedness.
- Joris Dormans, [“Simulating Mechanics to Study Emergence in Games”](https://ojs.aaai.org/index.php/AIIDE/article/view/12477): model resource flows, internal economies, and emergent feedback before implementation.
- Daniel Cook, [“The Chemistry of Game Design”](https://www.gamedeveloper.com/design/the-chemistry-of-game-design): action/simulation/feedback/learning atoms and skill-chain analysis.
- Robin Hunicke and Vernell Chapman, [“AI for Dynamic Difficulty Adjustment in Games”](https://users.cs.northwestern.edu/~hunicke/pubs/Hamlet.pdf): difficulty, resource supply, uncertainty, and the limitations of adjustment systems.
- Christiane Birk and colleagues, [“Designing Game Feel: A Survey”](https://arxiv.org/abs/2011.09201): physical tuning, feedback amplification, and intent-supporting streamlining.
- GDC, [“Prime, Teach, Observe”](https://gdcvault.com/play/1021120/Prime-Teach-Observe-Tutorializing-Innovative): teach mechanics through player modeling and iterative observation.
- Microsoft Games Studios, [“Using the RITE Method to Improve Products”](https://jpattonassociates.com/wp-content/uploads/2015/04/rite_method.pdf): rapidly fix and empirically verify high-confidence usability problems.
- Microsoft, [Xbox Accessibility Guidelines](https://learn.microsoft.com/en-us/xbox/accessibility/guidelines): player-informed guidance for input, objectives, feedback, difficulty, timing, sensory access, and communication.
- Matthias Worch, [“Decisions That Matter”](https://gdcvault.com/play/1020570/): connect informed choice, agency, consequence, and level context.
