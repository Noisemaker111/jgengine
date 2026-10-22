import { describe, expect, test } from "bun:test";

import { createMissionRuntime, validateMissionCatalog, type MissionDef, type MissionRuntime } from "./mission";

const DEPOT = { x: 0, y: 0, z: 0 };
const YARD = { x: 30, y: 0, z: 0 };
const MARKERS = { depot: DEPOT, yard: YARD };

/** A courier run: reach the depot in time, lose the cargo if it is dropped on the way. */
const COURIER: MissionDef = {
  id: "courier",
  title: "Boardwalk breakfast",
  objectives: [{
    id: "deliver",
    kind: "reach",
    actor: "player",
    marker: "depot",
    timeout: 60,
    onTimeout: "too_slow",
    failOn: [
      { kind: "event", match: { kind: "deliver", target: "parcel", tags: ["lost"] }, to: "cargo_lost", message: "the parcel was lost" },
      { kind: "left-area", actor: "player", marker: "depot", radius: 500, to: "left_the_route" },
    ],
  }],
  fail: [
    { id: "too_slow", message: "the window closed" },
    { id: "cargo_lost", message: "the parcel was lost" },
    { id: "left_the_route", message: "you left the route" },
  ],
};

/** Kill only the marked target, with the weapon it asked for; shooting the decoy ends it. */
const MARK: MissionDef = {
  id: "mark",
  title: "Marked target",
  objectives: [
    { id: "find", kind: "reach", actor: "player", marker: "yard", next: "drop" },
    {
      id: "drop",
      kind: "kill",
      count: 1,
      match: { target: "bounty_mark", by: "player", tags: ["rifle"], withoutTags: ["decoy"] },
      failOn: [{ kind: "event", match: { tags: ["decoy"] }, to: "decoy_killed", message: "that was a decoy" }],
      next: "done",
    },
  ],
  fail: [{ id: "decoy_killed", message: "that was a decoy" }],
  rewards: { economy: { cash: 250 } },
};

function runtime(missions: readonly MissionDef[]): MissionRuntime {
  return createMissionRuntime({ missions, markers: MARKERS, defaultPursuer: "player" });
}

const playerAt = (point: { x: number; y: number; z: number }) => ({ player: { position: point } });

describe("a held objective shows its own countdown", () => {
  test("a survive objective's remaining runs down from its duration", () => {
    const run = runtime([{
      id: "hold",
      title: "Hold",
      objectives: [{ id: "hold", kind: "survive", duration: 60, next: "done" }],
    }]);
    run.start("hold");
    run.tick(10, { survivors: 1 });
    expect(run.view()!.remaining).toBeCloseTo(50, 5);
    run.tick(20, { survivors: 1 });
    expect(run.view()!.remaining).toBeCloseTo(30, 5);
    run.tick(30, { survivors: 1 });
    expect(run.state()!.status).toBe("completed");
    expect(run.view()!.remaining).toBeNull();
  });
});

describe("a failed mission keeps its remaining and can be retried", () => {  test("the timer expiring fails the run, and the failure is readable", () => {
    const run = runtime([COURIER]);
    run.start("courier");
    run.tick(59, { actors: playerAt({ x: 200, y: 0, z: 0 }) });
    expect(run.state()!.status).toBe("active");
    expect(run.view()!.remaining).toBeCloseTo(1, 5);

    run.tick(1.5, { actors: playerAt({ x: 200, y: 0, z: 0 }) });
    const view = run.view()!;
    expect(view.status).toBe("failed");
    expect(view.outcome).toBe("too_slow");
    expect(view.reason).toBe("the window closed");
    expect(view.remaining).toBeNull();
  });
});

describe("a mission resumes with the correct remaining time", () => {
  test("save after 20 s restores 40 s of the 60 s contract", () => {
    const before = runtime([COURIER]);
    before.start("courier");
    before.tick(20, { actors: playerAt({ x: 200, y: 0, z: 0 }) });
    expect(before.view()!.remaining).toBeCloseTo(40, 5);
    const saved = before.snapshot();

    const after = runtime([COURIER]);
    after.restore(saved);
    expect(after.view()!.remaining).toBeCloseTo(40, 5);

    after.tick(39, { actors: playerAt({ x: 200, y: 0, z: 0 }) });
    expect(after.state()!.status).toBe("active");
    after.tick(1.5, { actors: playerAt({ x: 200, y: 0, z: 0 }) });
    expect(after.state()!.outcome).toBe("too_slow");
  });

  test("a restored constrained objective keeps its counted progress", () => {
    const before = runtime([MARK]);
    before.start("mark");
    before.tick(1 / 60, { actors: playerAt(YARD) });
    before.tick(1 / 60, {
      actors: playerAt(YARD),
      events: [{ kind: "kill", target: "bounty_mark", by: "player", tags: ["rifle"] }],
    });
    expect(before.state()!.status).toBe("completed");

    const run = runtime([MARK]);
    run.start("mark");
    run.tick(1 / 60, { actors: playerAt(YARD) });
    const saved = run.snapshot();
    expect(saved.state!.progress).toEqual({});

    const restored = runtime([MARK]);
    restored.restore(saved);
    expect(restored.state()!.objective).toBe("drop");
    expect(restored.view()!.counted).toBe(0);
  });
});

describe("an objective is not satisfied by the wrong event", () => {
  test("a kill without the required tag does not count", () => {
    const run = runtime([MARK]);
    run.start("mark");
    run.tick(1 / 60, { actors: playerAt(YARD) });
    run.tick(1 / 60, {
      actors: playerAt(YARD),
      events: [{ kind: "kill", target: "bounty_mark", by: "player", tags: ["shotgun"] }],
    });
    expect(run.state()!.status).toBe("active");
    expect(run.view()!.counted).toBe(0);
  });

  test("a kill of the wrong target does not count", () => {
    const run = runtime([MARK]);
    run.start("mark");
    run.tick(1 / 60, { actors: playerAt(YARD) });
    run.tick(1 / 60, {
      actors: playerAt(YARD),
      events: [{ kind: "kill", target: "ganger", by: "player", tags: ["rifle"] }],
    });
    expect(run.state()!.status).toBe("active");
  });

  test("a kill by another actor does not count", () => {
    const run = runtime([MARK]);
    run.start("mark");
    run.tick(1 / 60, { actors: playerAt(YARD) });
    run.tick(1 / 60, {
      actors: playerAt(YARD),
      events: [{ kind: "kill", target: "bounty_mark", by: "rival", tags: ["rifle"] }],
    });
    expect(run.state()!.status).toBe("active");
  });

  test("a collect event does not satisfy a kill objective", () => {
    const run = runtime([MARK]);
    run.start("mark");
    run.tick(1 / 60, { actors: playerAt(YARD) });
    run.tick(1 / 60, {
      actors: playerAt(YARD),
      events: [{ kind: "collect", target: "bounty_mark", by: "player", tags: ["rifle"] }],
    });
    expect(run.state()!.status).toBe("active");
  });

  test("the decoy ending the contract beats the credited kill", () => {
    const run = runtime([MARK]);
    run.start("mark");
    run.tick(1 / 60, { actors: playerAt(YARD) });
    const events = run.tick(1 / 60, {
      actors: playerAt(YARD),
      events: [{ kind: "kill", target: "bounty_mark", by: "player", tags: ["rifle", "decoy"] }],
    });
    expect(events.map((event) => event.kind)).toEqual(["failed"]);
    expect(run.state()!.outcome).toBe("decoy_killed");
  });

  test("cargo dropped fails the delivery even when the depot is reached", () => {
    const run = runtime([COURIER]);
    run.start("courier");
    const events = run.tick(1 / 60, {
      actors: playerAt(DEPOT),
      events: [{ kind: "deliver", target: "parcel", tags: ["lost"] }],
    });
    expect(events.map((event) => event.kind)).toEqual(["failed"]);
    expect(run.state()!.outcome).toBe("cargo_lost");
  });

  test("a courier that leaves the route fails into its own state", () => {
    const run = runtime([COURIER]);
    run.start("courier");
    run.tick(1 / 60, { actors: playerAt({ x: 501, y: 0, z: 0 }) });
    expect(run.state()!.outcome).toBe("left_the_route");
  });
});

describe("a three-step chain runs in order and pays once", () => {
  const CHAIN: MissionDef = {
    id: "relay",
    title: "Relay sweep",
    objectives: [
      { id: "reach_yard", kind: "reach", actor: "player", marker: "yard", next: "burn_pack" },
      { id: "burn_pack", kind: "kill", count: 2, match: { target: "husk", tags: ["shock"] }, next: "hold" },
      { id: "hold", kind: "survive", duration: 60, label: "Hold the relay for 60s", next: "done" },
    ],
    rewards: { economy: { cash: 900 } },
  };

  test("each step advances only on its own condition", () => {
    const run = runtime([CHAIN]);
    run.start("relay");
    expect(run.view()!.step).toBe(1);
    expect(run.view()!.steps).toBe(3);

    run.tick(1 / 60, {
      actors: playerAt(DEPOT),
      events: [{ kind: "kill", target: "husk", by: "player", tags: ["shock"] }],
    });
    expect(run.view()!.objectiveId).toBe("reach_yard");

    run.tick(1 / 60, { actors: playerAt(YARD) });
    expect(run.view()!.objectiveId).toBe("burn_pack");
    expect(run.view()!.step).toBe(2);

    run.tick(1 / 60, { events: [{ kind: "kill", target: "husk", by: "player", tags: ["shock"] }] });
    expect(run.view()!.objectiveId).toBe("burn_pack");
    run.tick(1 / 60, { events: [{ kind: "kill", target: "husk", by: "player", tags: ["shock"] }] });
    expect(run.view()!.objectiveId).toBe("hold");
    expect(run.view()!.step).toBe(3);

    run.tick(59, { survivors: 4 });
    expect(run.state()!.status).toBe("active");
    const events = run.tick(1, { survivors: 4 });
    expect(run.state()!.status).toBe("completed");
    expect(events.filter((event) => event.kind === "reward")).toHaveLength(1);
  });

  test("a survival step can still be overrun, and the reward is not paid", () => {
    const run = runtime([{
      ...CHAIN,
      objectives: [
        { id: "reach_yard", kind: "reach", actor: "player", marker: "yard", next: "hold" },
        { ...CHAIN.objectives[2]!, minSurvivors: 3, minSurvivorsFail: "overrun" },
      ],
      fail: [{ id: "overrun", message: "the relay fell" }],
    }]);
    run.start("relay");
    run.tick(1 / 60, { actors: playerAt(YARD) });
    const events = run.tick(1, { survivors: 1 });
    expect(run.state()!.outcome).toBe("overrun");
    expect(events.some((event) => event.kind === "reward")).toBe(false);
  });
});

describe("catalog validation covers the event paths", () => {
  test("a left-area fail with no marker is rejected", () => {
    const issues = validateMissionCatalog([{
      id: "broken",
      title: "Broken",
      objectives: [{ id: "go", kind: "reach", actor: "player", marker: "depot",
        failOn: [{ kind: "left-area", to: "gone" }] }],
      fail: [{ id: "gone" }],
    }], { markerIds: ["depot"] });
    expect(issues.some((issue) => issue.code === "missing-marker" && issue.severity === "error")).toBe(true);
  });

  test("a match on a reach objective is rejected rather than ignored", () => {
    const issues = validateMissionCatalog([{
      id: "wrong",
      title: "Wrong",
      objectives: [{ id: "go", kind: "reach", actor: "player", marker: "depot", match: { target: "door" } }],
    }], { markerIds: ["depot"] });
    expect(issues.some((issue) => issue.code === "invalid-match" && issue.severity === "error")).toBe(true);
  });
});
