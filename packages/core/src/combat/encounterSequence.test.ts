import { describe, expect, test } from "bun:test";

import {
  activePhaseId,
  createEncounterState,
  encounterProgress,
  forceCompletePhase,
  injectPhase,
  phaseStatus,
  startEncounter,
  updateEncounter,
  type EncounterConfig,
  type EncounterContext,
  type EncounterEvent,
  type EncounterPhase,
  type EncounterSpawnRequest,
} from "./encounterSequence";

/** Collect the phaseIds of a given event type across a list of steps. */
function idsOf(events: readonly EncounterEvent[], type: EncounterEvent["type"]): string[] {
  return events.filter((e) => e.type === type).map((e) => ("phaseId" in e ? e.phaseId : ""));
}

/** A three-wave combat arena: each wave clears its tagged spawns before the next. */
function arenaConfig(): EncounterConfig<{ label: string }> {
  return {
    phases: [
      {
        id: "wave-1",
        data: { label: "Wave 1" },
        spawn: { kind: "points", params: { ref: "ring", entity: "grunt", count: 3 } },
        completion: { kind: "cleared", params: { tag: "grunt" } },
      },
      {
        id: "wave-2",
        data: { label: "Wave 2" },
        spawn: { kind: "points", params: { ref: "ring", entity: "brute", count: 2 } },
        completion: { kind: "cleared", params: { tag: "brute" } },
      },
      {
        id: "wave-3",
        data: { label: "Wave 3" },
        spawn: { kind: "points", params: { ref: "ring", entity: "runner", count: 4 } },
        completion: { kind: "cleared", params: { tag: "runner" } },
      },
    ],
  };
}

const arenaCtx: EncounterContext = {
  spawnPoints: {
    ring: [
      [0, 0],
      [4, 0],
      [0, 4],
      [4, 4],
    ],
  },
  signals: { counts: {} },
};

describe("encounter sequence — arena adopter", () => {
  test("predicate-gated advance: a wave only completes once its tag is cleared", () => {
    const config = arenaConfig();
    const state = createEncounterState(config);
    const start = startEncounter(config, state, arenaCtx);

    expect(activePhaseId(state)).toBe("wave-1");
    // Opening spawn came from the authored scene points, not embedded coordinates.
    const spawn = start.events.find((e) => e.type === "spawn");
    expect(spawn?.type).toBe("spawn");
    if (spawn?.type === "spawn") {
      expect(spawn.requests).toHaveLength(3);
      expect(spawn.requests.every((r: EncounterSpawnRequest) => r.point !== undefined)).toBe(true);
      expect(spawn.requests[0]!.ref).toBe("grunt");
    }

    // Grunts still alive → no advance.
    let step = updateEncounter(config, state, 0.5, { ...arenaCtx, signals: { counts: { grunt: 2 } } });
    expect(activePhaseId(state)).toBe("wave-1");
    expect(step.events).toHaveLength(0);

    // Grunts cleared → advance to wave-2 and spawn brutes.
    step = updateEncounter(config, state, 0.5, { ...arenaCtx, signals: { counts: { grunt: 0 } } });
    expect(activePhaseId(state)).toBe("wave-2");
    expect(idsOf(step.events, "complete")).toContain("wave-1");
    expect(idsOf(step.events, "enter")).toContain("wave-2");
    expect(phaseStatus(state, "wave-1")).toBe("complete");

    // Clear the rest.
    updateEncounter(config, state, 0.5, { ...arenaCtx, signals: { counts: { brute: 0 } } });
    expect(activePhaseId(state)).toBe("wave-3");
    const final = updateEncounter(config, state, 0.5, { ...arenaCtx, signals: { counts: { runner: 0 } } });
    expect(state.done).toBe(true);
    expect(final.events.some((e) => e.type === "done")).toBe(true);
    expect(encounterProgress(state)).toEqual({ completed: 3, total: 3, done: true });
  });

  test("injected phase: a boss is inserted after the final wave at runtime", () => {
    const config = arenaConfig();
    const state = createEncounterState(config);
    startEncounter(config, state, arenaCtx);

    // Advance to the last wave.
    updateEncounter(config, state, 1, { signals: { counts: { grunt: 0 } } });
    updateEncounter(config, state, 1, { signals: { counts: { brute: 0 } } });
    expect(activePhaseId(state)).toBe("wave-3");

    // Inject a boss AFTER wave-3 while wave-3 is still active — no built-in final concept.
    const boss: EncounterPhase<{ label: string }> = {
      id: "boss",
      data: { label: "Boss" },
      spawn: { kind: "points", params: { ref: "ring", entity: "boss", count: 1 } },
      completion: { kind: "cleared", params: { tag: "boss" } },
    };
    injectPhase(state, boss, { after: "wave-3" });
    expect(encounterProgress(state).total).toBe(4);

    // Finish wave-3 → boss becomes active instead of the encounter ending.
    const step = updateEncounter(config, state, 1, { ...arenaCtx, signals: { counts: { runner: 0 } } });
    expect(activePhaseId(state)).toBe("boss");
    expect(idsOf(step.events, "enter")).toContain("boss");
    expect(state.done).toBe(false);

    // Kill the boss → encounter done.
    updateEncounter(config, state, 1, { signals: { counts: { boss: 0 } } });
    expect(state.done).toBe(true);
    expect(encounterProgress(state)).toEqual({ completed: 4, total: 4, done: true });
  });

  test("serialize round-trip mid-encounter resumes identically", () => {
    const config = arenaConfig();
    const state = createEncounterState(config);
    startEncounter(config, state, arenaCtx);
    updateEncounter(config, state, 0.5, { signals: { counts: { grunt: 0 } } });
    // Mid-encounter: inject a branch, then save.
    injectPhase(state, { id: "ambush", completion: { kind: "timer", params: { seconds: 2 } } }, { after: "wave-2" });
    expect(activePhaseId(state)).toBe("wave-2");

    const saved = JSON.parse(JSON.stringify(state)) as typeof state;
    // Continue both the live and restored state with identical inputs; they must match.
    const liveA = updateEncounter(config, state, 0.5, { signals: { counts: { brute: 0 } } });
    const restoredA = updateEncounter(config, saved, 0.5, { signals: { counts: { brute: 0 } } });
    expect(activePhaseId(saved)).toBe(activePhaseId(state));
    expect(activePhaseId(saved)).toBe("ambush");
    expect(idsOf(restoredA.events, "enter")).toEqual(idsOf(liveA.events, "enter"));

    // The injected ambush is a timer gate: still active after 1s, done after 2s.
    updateEncounter(config, saved, 1, {});
    expect(activePhaseId(saved)).toBe("ambush");
    updateEncounter(config, saved, 1, {});
    expect(activePhaseId(saved)).toBe("wave-3");
    // The restored state is plain serializable data throughout — no functions leaked in.
    expect(() => JSON.stringify(saved)).not.toThrow();
  });
});

describe("encounter sequence — nested groups", () => {
  test("nested completion bubbles up: a group finishes when its children do", () => {
    const config: EncounterConfig = {
      phases: [
        {
          id: "act-1",
          children: [
            { id: "beat-a", completion: { kind: "event", params: { name: "a" } } },
            { id: "beat-b", completion: { kind: "event", params: { name: "b" } } },
          ],
        },
        { id: "act-2", completion: { kind: "event", params: { name: "c" } } },
      ],
    };
    const state = createEncounterState(config);
    startEncounter(config, state);
    // Enter descends group act-1 → its first leaf beat-a.
    expect(activePhaseId(state)).toBe("beat-a");
    expect(phaseStatus(state, "act-1")).toBe("active");

    updateEncounter(config, state, 1, { signals: { events: { a: 1 } } });
    expect(activePhaseId(state)).toBe("beat-b");
    expect(phaseStatus(state, "act-1")).toBe("active");

    const step = updateEncounter(config, state, 1, { signals: { events: { b: 1 } } });
    // beat-b done → act-1 (no own predicate) completes and bubbles to act-2.
    expect(idsOf(step.events, "complete")).toEqual(["beat-b", "act-1"]);
    expect(activePhaseId(state)).toBe("act-2");
    expect(phaseStatus(state, "act-1")).toBe("complete");
  });

  test("a group's own predicate gates completion after its children finish", () => {
    const config: EncounterConfig = {
      phases: [
        {
          id: "hold",
          // Survive 3s AND clear the adds before the group completes.
          completion: { kind: "timer", params: { seconds: 3 } },
          children: [{ id: "adds", completion: { kind: "cleared", params: { tag: "add" } } }],
        },
        { id: "after", completion: { kind: "immediate" } },
      ],
    };
    const state = createEncounterState(config);
    startEncounter(config, state);
    expect(activePhaseId(state)).toBe("adds");

    // Children clear quickly, but the group timer has not elapsed → cursor sits on the group.
    updateEncounter(config, state, 1, { signals: { counts: { add: 0 } } });
    expect(activePhaseId(state)).toBe("hold");
    expect(phaseStatus(state, "adds")).toBe("complete");

    updateEncounter(config, state, 1, {});
    expect(activePhaseId(state)).toBe("hold");
    // Group entered at elapsed 0; after 3s total the timer passes.
    const step = updateEncounter(config, state, 1.5, {});
    expect(idsOf(step.events, "complete")).toContain("hold");
    expect(state.done).toBe(true);
  });

  test("repeat re-runs a subtree before advancing", () => {
    // A 1s timer resets each iteration (phaseElapsed measured from re-enter), so each
    // update completes exactly one run of the repeating phase.
    const config: EncounterConfig = {
      phases: [
        { id: "pulse", repeat: 2, completion: { kind: "timer", params: { seconds: 1 } } },
        { id: "end", completion: { kind: "immediate" } },
      ],
    };
    const state = createEncounterState(config);
    startEncounter(config, state);
    // iteration 0 completes, re-enters as iteration 1.
    let step = updateEncounter(config, state, 1, {});
    expect(activePhaseId(state)).toBe("pulse");
    expect(idsOf(step.events, "enter")).toContain("pulse");
    // iteration 1 completes, re-enters as iteration 2.
    updateEncounter(config, state, 1, {});
    expect(activePhaseId(state)).toBe("pulse");
    // iteration 2 is the last (repeat: 2 = two extra) → completes and advances to end.
    step = updateEncounter(config, state, 1, {});
    expect(state.done).toBe(true);
    expect(idsOf(step.events, "complete")).toContain("pulse");
  });

  test("empty group node completes immediately and is skipped", () => {
    const config: EncounterConfig = {
      phases: [
        { id: "intro", completion: { kind: "immediate" } },
        { id: "empty", children: [] },
        { id: "outro", completion: { kind: "flag" } },
      ],
    };
    const state = createEncounterState(config);
    startEncounter(config, state);
    const step = updateEncounter(config, state, 0, {});
    // intro + empty auto-complete in one tick, cursor lands on outro awaiting its flag.
    expect(idsOf(step.events, "complete")).toEqual(["intro", "empty"]);
    expect(activePhaseId(state)).toBe("outro");
  });
});

describe("encounter sequence — predicates and control", () => {
  test("quorum completes when N of nested predicates are met", () => {
    const config: EncounterConfig = {
      phases: [
        {
          id: "objectives",
          completion: {
            kind: "quorum",
            params: {
              count: 2,
              predicates: [
                { kind: "flag", params: { flag: "generator" } },
                { kind: "flag", params: { flag: "relay" } },
                { kind: "flag", params: { flag: "beacon" } },
              ],
            },
          },
        },
      ],
    };
    const state = createEncounterState(config);
    startEncounter(config, state);
    updateEncounter(config, state, 0, { signals: { flags: { generator: true } } });
    expect(state.done).toBe(false);
    updateEncounter(config, state, 0, { signals: { flags: { generator: true, relay: true } } });
    expect(state.done).toBe(true);
  });

  test("metric predicate advances on a live threshold", () => {
    const config: EncounterConfig = {
      phases: [{ id: "defend", completion: { kind: "metric", params: { name: "integrity", target: 50, direction: "atMost" } } }],
    };
    const state = createEncounterState(config);
    startEncounter(config, state);
    updateEncounter(config, state, 1, { signals: { metrics: { integrity: 80 } } });
    expect(state.done).toBe(false);
    updateEncounter(config, state, 1, { signals: { metrics: { integrity: 40 } } });
    expect(state.done).toBe(true);
  });

  test("forceCompletePhase advances a scripted/failed phase regardless of predicate", () => {
    const config = arenaConfig();
    const state = createEncounterState(config);
    startEncounter(config, state, arenaCtx);
    expect(activePhaseId(state)).toBe("wave-1");
    // Skip wave-1 without clearing it (e.g. a scripted retreat).
    const liveCtx: EncounterContext = { ...arenaCtx, signals: { counts: { brute: 3, runner: 3 } } };
    const step = forceCompletePhase(config, state, liveCtx);
    expect(idsOf(step.events, "complete")).toContain("wave-1");
    expect(activePhaseId(state)).toBe("wave-2");
    // The authored predicate is restored — wave-2 still needs its clear.
    updateEncounter(config, state, 1, { signals: { counts: { brute: 3 } } });
    expect(activePhaseId(state)).toBe("wave-2");
  });

  test("large time delta does not overshoot past a pending predicate", () => {
    const config: EncounterConfig = {
      phases: [
        { id: "wait", completion: { kind: "timer", params: { seconds: 5 } } },
        { id: "gate", completion: { kind: "flag" } },
      ],
    };
    const state = createEncounterState(config);
    startEncounter(config, state);
    // A 100s frame completes the timer but stops at the flag-gated phase.
    updateEncounter(config, state, 100, {});
    expect(activePhaseId(state)).toBe("gate");
    expect(state.done).toBe(false);
  });
});

describe("encounter sequence — non-combat adopter", () => {
  test("a tutorial reuses the primitive with no spawn or combat concepts", () => {
    // Same sequencing primitive drives a scripted tutorial: nested steps, predicate gates,
    // and a dynamically injected hint — zero combat/spawn coupling.
    const config: EncounterConfig<{ prompt: string }> = {
      phases: [
        {
          id: "movement",
          data: { prompt: "Use WASD to move" },
          children: [
            { id: "walk", data: { prompt: "Walk forward" }, completion: { kind: "flag", params: { flag: "moved" } } },
            { id: "jump", data: { prompt: "Press space to jump" }, completion: { kind: "flag", params: { flag: "jumped" } } },
          ],
        },
        { id: "goal", data: { prompt: "Reach the marker" }, completion: { kind: "flag", params: { flag: "reached" } } },
      ],
    };
    const state = createEncounterState(config);
    startEncounter(config, state);
    expect(activePhaseId(state)).toBe("walk");

    updateEncounter(config, state, 0, { signals: { flags: { moved: true } } });
    expect(activePhaseId(state)).toBe("jump");

    // Inject a contextual hint step after the jump lesson at runtime.
    injectPhase(state, { id: "hint", data: { prompt: "Nice! Try double-jump" }, completion: { kind: "flag", params: { flag: "acked" } } }, { after: "jump" });
    updateEncounter(config, state, 0, { signals: { flags: { jumped: true } } });
    expect(activePhaseId(state)).toBe("hint");

    updateEncounter(config, state, 0, { signals: { flags: { acked: true } } });
    expect(activePhaseId(state)).toBe("goal");
    updateEncounter(config, state, 0, { signals: { flags: { reached: true } } });
    expect(state.done).toBe(true);
  });
});
