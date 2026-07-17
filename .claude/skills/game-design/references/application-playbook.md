# Applying game design

Use this playbook to turn a pitch or an existing game into implemented, testable change. Its purpose is to prevent “design work” from ending as generic advice.

## Contents

1. Greenfield procedure
2. Existing-game audit
3. Mandatory models
4. Ranking interventions
5. Design-slice specification
6. Implementation and proof
7. Failure modes

## 1. Greenfield procedure

### Frame the bet

Write a compact contract before broad code or content:

| Field | Required form |
| --- | --- |
| audience/context | prior skills, player count, platform/input, session length, accessibility assumptions |
| player promise | “The player repeatedly [verb/decision] so they feel [specific experience]” |
| pillars | two or three observable behaviors or feelings |
| anti-pillars | experiences the game must not drift toward |
| core decision | situation, known information, viable options, tradeoff, consequence, recurrence |
| completion proof | one end-to-end scenario a target player can perform and explain |
| falsifier | observation that would show the design does not work |

### Build the minimum design

1. Model each core verb from cue through future consequence.
2. Draw moment, encounter, session, and meta loops.
3. Draw resources and feedback structures.
4. Map player skills and progression channels.
5. Define failure, recovery, stopping, and replay.
6. Create a content grammar: a small set of mechanics crossed with contexts and constraints.
7. Select the riskiest assumption and build one vertical design slice around it.

Do not build the entire feature list first. A vertical slice contains real input, meaningful state, feedback, one decision that recurs, failure/recovery, and a downstream consequence.

## 2. Existing-game audit

### Reconstruct reality

Inspect actual code, catalogs, scene documents, UI, tests, captures, and live play. Do not infer the game from its title or README.

Trace four journeys when applicable:

- **first minute:** first input, goal, threat, reward, confusion, and reason to continue
- **first objective:** learning sequence, decisions, failure, recovery, payoff, and next goal
- **representative session:** loop renewal, variety, resource pressure, build choices, pacing, and stopping point
- **campaign/meta:** unlock cadence, content reuse, escalation, economy stability, mastery, and ending/replay

For each journey, record timestamps or event order:

`cue -> player belief -> action -> system response -> feedback -> state change -> next choice`

Mark dead time, repeated decisions, forced actions, hidden consequences, false affordances, unexplained failure, and rewards that do not alter later play.

### Build a system-coupling map

Inventory verbs, enemies/problems, items/tools, progression, economy, quests/objectives, world states, social systems, and failure. For each system ask:

- Which pillar does it serve?
- Which loop consumes its output?
- What player decision does it create or transform?
- Where is it taught, tested, combined, and mastered?
- What happens if it is removed?

Flag systems that are present but disconnected, content whose only variation is numbers or nouns, and rewards that bypass the core play.

### Diagnose decision density

Do not maximize decisions per second. Find long spans where the player executes an already-solved action without new information, tradeoffs, expression, pressure, or mastery. Measure:

- time to first meaningful decision
- meaningful decisions per encounter/objective
- time between new information and commitment
- percentage of objectives using each verb or decision type
- repeated content before context changes
- time from failure to a useful retry

## 3. Mandatory models

### Loop table

| Horizon | Cue/goal | Decision/action | Feedback | State changed | Why repeat? | Failure risk |
| --- | --- | --- | --- | --- | --- | --- |

Reject any row whose “state changed” or “why repeat” is empty.

### Resource-flow table

| Resource | Source | Store/cap | Spend/convert | Sink | Player decision | Feedback/runaway risk |
| --- | --- | --- | --- | --- | --- | --- |

Include time, health, space, information, attention, action opportunities, and social trust when relevant.

### Progression table

| Unlock/reward | Channel | New decision or capability | Content it recontextualizes | Risk of invalidation/grind | Proof |
| --- | --- | --- | --- | --- | --- |

Channels are mastery, access, breadth, power, and expression/status. Passive percentages without a changed decision must justify their place.

### Objective/encounter variety matrix

Cross objective verbs with information state, constraints, enemy/problem behavior, topology, resource pressure, failure condition, and consequence. This exposes campaigns where every mission is the same verb with different nouns.

## 4. Ranking interventions

Separate symptoms from root causes. “Quests are boring” is a symptom. “Every quest uses the same kill-count transition and no objective changes space, resources, or strategy” is a testable cause.

Rank each candidate:

| Candidate | Player behavior changed | Pillar impact | Reach | Evidence/confidence | Effort/risk | Dependencies | Shared owner |
| --- | --- | --- | --- | --- | --- | --- | --- |

Use three horizons:

- **Minimum correction:** remove the largest contradiction or unblock the loop.
- **Strong target:** make one representative slice deliver the promise end to end.
- **Multiplier:** expand the proven grammar across content, progression, social play, or replay.

Choose by leverage, not novelty. Prefer a change that improves many encounters or future games over bespoke content with the same underlying decision.

## 5. Design-slice specification

The selected slice must state:

- before behavior and evidence
- target behavior and player belief
- mechanics/dynamics expected to cause the change
- objective/encounter sequence and pacing beats
- resources, rewards, failure, recovery, and downstream consequence
- affected catalogs/config, shared package seams, scene semantics, UI feedback, and tests
- tuning variables with starting hypotheses and safe bounds
- explicit non-goals and content held constant
- acceptance scenario and falsifiers

If another game could use the mechanic, define the package primitive first and adopt it here. Keep game-local code for content and feel.

## 6. Implementation and proof

When the user asks to build or improve:

1. Implement the shared primitive or use an existing capability.
2. Adopt it in one complete game slice.
3. Author spatial content through `level-design` and the editor.
4. Add deterministic tests for transitions, resources, failure, and progression.
5. Exercise the observable scenario with representative input.
6. Capture before/after evidence for behavior, not only appearance.
7. Evaluate the falsifier honestly; revise or remove a failed intervention.

Useful evidence includes time to first decision, objective completion, route choice, build choice, resource state, failure cause, retry time, objective-verb distribution, and a player’s ability to explain goal/action/consequence. Metrics need a named hypothesis; do not optimize them in isolation.

## 7. Failure modes

- producing a long GDD instead of a playable slice
- listing features without naming changed decisions
- adding content to a shallow objective grammar
- using passive progression to disguise unchanged play
- copying a genre’s surface without its causal dynamics
- treating more rewards as more motivation
- fixing comprehension only with text or HUD
- reporting a diagnosis after the user asked for improvement
- calling deterministic tests proof that the experience works
- calling a prettier screenshot proof that the loop works
