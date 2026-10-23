# Agent lives: needs, mood, relationships, schedules

One system for every resident that wants something. `createAgent` (`@jgengine/core/agents/agent`)
composes four owners that already exist: `createNeedSet` (`sim/needs`) decays the needs,
`createUtilityBrain` (`ai/utilityBrain`) scores what to do, `resolveRoutine` (`sim/routine`) says
where the day plan puts the agent, and `createMoodReader` (`agents/mood`) reads how satisfied it is.
A game supplies the targets its world offers and owns the body, the nav and the art.

```ts
import { createAgent } from "@jgengine/core/agents/agent";
import { createRelationshipBook } from "@jgengine/core/agents/relationships";

const needs = [
  { id: "hunger", max: 100, rate: 0.9 },
  { id: "fun", max: 100, rate: 0.6 },
  { id: "energy", max: 100, rate: 0.5 },
];

const agent = createAgent({
  id: "guest:1",
  needs,
  options: [
    { id: "eat", terms: [{ need: "hunger", curve: { kind: "linear", from: 0.2, to: 0.95 } }] },
    { id: "ride", terms: [{ need: "fun", curve: { kind: "linear", from: 0.15, to: 0.9 } }] },
    { id: "seat", base: 0.05, terms: [{ need: "energy", curve: { kind: "linear", from: 0.1, to: 1 } }] },
    { id: "work", base: 0.2 },
  ],
  schedule: {
    cycleSeconds: 86_400,
    stops: [
      { place: "home", arriveAt: 0, activity: "sleep", refill: { energy: 70 } },
      { place: "lobby", arriveAt: 30_000, activity: "work", beat: ["hall-a", "hall-b", "hall-c"] },
      { place: "cafe", arriveAt: 50_000, activity: "meal", refill: { hunger: 60 } },
    ],
    travelSeconds: (from, to) => distances.get(`${from}>${to}`) ?? 60,
  },
  mood: { weights: [{ need: "hunger", weight: 2 }, { need: "fun", weight: 1 }] },
  rng: ctx.rng,
});

agent.update({
  dt,
  now: ctx.time.now(),
  targets: [
    { option: "ride", target: "coaster", cost: queueSeconds, fallback: { option: "seat", target: "bench" } },
    { option: "eat", target: "burger-stall", cost: walkSeconds },
    { option: "seat", target: "bench" },
  ],
});
```

Read the frame, not the internals: `frame.action` (`option`, `target`, `usedFallback`), `frame.mood`
(`score`, `tier`, `label`), `frame.phase` and `frame.post` (where the schedule and the work beat put
the agent), and `frame.changed` with `frame.reason`. `targets` is the world as it is this tick, so a
sold-out stall simply is not in the list, and a pick whose target disappears moves to its declared
`fallback` instead of freezing.

- **Saved state.** `agent.snapshot()` carries needs (values, rates, modifiers), mood sources, the held
  pick and its dials, the action, the far flag and the schedule stop the agent last ate at. The day
  plan itself is authored data resolved from the clock, so it is never saved. Put every agent's
  snapshot and one `book.snapshot()` in the save document.
- **Far agents.** `agent.setFar(true)` stops the utility pass: the agent keeps decaying and follows
  its schedule, and its action reads off the phase. A far agent costs no decision and no nav.
- **Mood from the world.** `agent.moodSources.setSource("queue", -20)` and `clearSource` let a queue,
  litter, a broken ride or a cold snap move the feeling without giving mood its own state machine.
- **One relationship book per world.** `book.socialise(a, b, { opinion: 6, familiarity: 0.1 })` returns
  the pair before and after plus the milestones crossed. `book.prefersCompanyOf(a, b)` is a friendship
  a game can act on by seating them together; `book.refusesToSplit(a, b)` is a bond that must not be
  posted to separate shifts. A bond needs opinion *and* time shared, so one good afternoon is not
  enough.
- **A work beat is not a special case.** A stop with `beat` walks those places in order for
  `beatDwellSeconds` each; a janitor, a security guard and a tour guide are the same agent with
  different authored beats. Off-hours behaviour is a stop without a beat.
- **Determinism.** Pass `ctx.rng` and set `jitter`; two agents built from the same seeded stream make
  the same choices. The game owns the RNG cursor in its save (`createGameSave` `rng`), since one
  stream is usually shared by the whole world.
