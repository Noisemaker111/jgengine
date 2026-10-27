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

### Write the design brief

The greenfield contract is the `## Design brief` in the game's `PLAN.md`; its shape is in `create-game-jg` step 3 (in this repo, `games/scripts/designBrief.ts`, with a complete example in `games/scripts/briefExample.ts`). Design each line rather than filling it:

| Brief line | What it must answer |
| --- | --- |
| Core loop | the 30-second verb and decision: situation, known information, viable options, tradeoff, consequence, recurrence |
| Session loop | what one sitting builds toward, and the natural stopping point |
| Long loop | what changes over hours: new places, rules or tools that recombine the core verb, not bigger numbers |
| Second 0 | what the player has at the start and why that makes the right first verb; a new game starts small, so later beats have something to give |
| First 10 minutes | beats with timestamps, each teaching or unlocking one thing, the first by 2:00 |
| Pace, longest cycle | how often something new arrives, and the longest wait between payoffs a player accepts |
| Content budget, minutes | how many items, areas, verbs (or this game's kinds) carry the long loop, and the minutes they add up to |
| Systems | each system and the probe reading that shows a player used it |
| Onboarding | guide character, objectives, hints or learning by doing |

Write the player promise (“the player repeatedly [verb/decision] so they feel [specific experience]”), two or three pillars, the anti-pillars and the falsifier (the observation that would show the design does not work) in `## Direction`.

### Build it ten minutes at a time

1. Model each core verb from cue through future consequence.
2. Draw resources and feedback structures, and the failure, recovery, stopping and replay rules.
3. Create a content grammar: a small set of mechanics crossed with contexts and constraints; the content budget counts its products.
4. Milestone 1 is the core loop playable from second 0, through real input, with feedback, one recurring decision, failure/recovery and a downstream consequence.
5. Each later milestone is the next 10 minutes of play: the beats it adds, what they teach and unlock, and the from-zero flow reaching further.

Do not build the feature list first, and do not stop at a slice: a game that ends after the first 10 minutes is a demo.

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
