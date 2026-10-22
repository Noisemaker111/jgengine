import { describe, expect, test } from "bun:test";

import { chaseMission, defendMission, escortMission } from "./compositions";
import { createMissionRuntime, isCounterObjective, type MissionDef } from "./mission";

const GATE = { x: 0, y: 0, z: 0 };
const DEPOT = { x: 5, y: 0, z: 5 };
const MARKERS = { gate: GATE, depot: DEPOT };

function runtime(missions: readonly MissionDef[]) {
  return createMissionRuntime({ missions, markers: MARKERS, defaultPursuer: "player" });
}

describe("escort composition", () => {
  const CONVOY = escortMission({
    id: "convoy",
    title: "Convoy",
    escortee: "npc",
    destination: "depot",
    meetMarker: "gate",
    timeoutSeconds: 60,
  });

  test("fails when the escortee dies", () => {
    const run = runtime([CONVOY]);
    run.start("convoy");
    run.tick(1 / 60, { actors: { npc: { position: GATE } } });
    expect(run.state()!.path).toEqual(["escort_meet", "escort_deliver"]);

    const events = run.tick(1 / 60, { actors: { npc: { alive: false } } });
    expect(events.some((event) => event.kind === "failed")).toBe(true);
    expect(run.state()!.status).toBe("failed");
    expect(run.state()!.outcome).toBe("convoy_lost");
  });

  test("completes when the escortee reaches the destination alive", () => {
    const run = runtime([CONVOY]);
    run.start("convoy");
    run.tick(1 / 60, { actors: { npc: { position: GATE } } });
    run.tick(1 / 60, { actors: { npc: { position: DEPOT } } });
    expect(run.state()!.status).toBe("completed");
  });

  test("is a reach objective guarded by an actor-died fail, not its own system", () => {
    expect(CONVOY.objectives.map((objective) => objective.kind)).toEqual(["reach", "reach"]);
    expect(CONVOY.objectives[1]!.failOn![0]!.kind).toBe("actor-died");
    expect(CONVOY.objectives[1]!.failOn![0]!.actor).toBe("npc");
  });
});

describe("defend composition", () => {
  const KEEP = defendMission({ id: "keep", title: "Keep", seconds: 10, minSurvivors: 2 });

  test("scores by what is left standing", () => {
    const many = runtime([KEEP]);
    many.start("keep");
    many.tick(10, { survivors: 5 });
    expect(many.state()!.status).toBe("completed");
    expect(many.state()!.score).toBe(5);

    const few = runtime([KEEP]);
    few.start("keep");
    few.tick(10, { survivors: 3 });
    expect(few.state()!.score).toBe(3);
  });

  test("fails into its named state when survivors drop below the floor", () => {
    const run = runtime([KEEP]);
    run.start("keep");
    run.tick(1, { survivors: 1 });
    expect(run.state()!.status).toBe("failed");
    expect(run.state()!.outcome).toBe("keep_overrun");
  });

  test("is a survive objective with a survivor floor, not its own system", () => {
    expect(KEEP.objectives.map((objective) => objective.kind)).toEqual(["survive"]);
    expect(KEEP.objectives[0]!.minSurvivors).toBe(2);
  });
});

describe("chase composition", () => {
  const RUNNER = chaseMission({
    id: "runner",
    title: "Runner",
    target: "thief",
    distance: 5,
    escapeDistance: 20,
    escapeGrace: 1,
  });

  test("completes when the target is caught", () => {
    const run = runtime([RUNNER]);
    run.start("runner");
    run.tick(1 / 60, {
      actors: { player: { position: GATE }, thief: { position: { x: 3, y: 0, z: 0 } } },
    });
    expect(run.state()!.status).toBe("completed");
  });

  test("fails into its named state when the target escapes past the grace", () => {
    const run = runtime([RUNNER]);
    run.start("runner");
    const far = { player: { position: GATE }, thief: { position: { x: 100, y: 0, z: 0 } } };
    run.tick(0.5, { actors: far });
    expect(run.state()!.status).toBe("active");
    run.tick(0.6, { actors: far });
    expect(run.state()!.status).toBe("failed");
    expect(run.state()!.outcome).toBe("runner_escaped");
  });

  test("is a pursue objective with an escape guard, not its own system", () => {
    expect(RUNNER.objectives.map((objective) => objective.kind)).toEqual(["pursue"]);
    expect(RUNNER.objectives[0]!.escapeFail).toBe("runner_escaped");
  });
});

describe("compositions stay on the shared objective kinds", () => {
  test("no composition invents an objective kind", () => {
    const all: MissionDef[] = [
      escortMission({ id: "e", title: "E", escortee: "npc", destination: "depot" }),
      chaseMission({ id: "c", title: "C", target: "thief" }),
      defendMission({ id: "d", title: "D", seconds: 5 }),
    ];
    const kinds = all.flatMap((mission) => mission.objectives.map((objective) => objective.kind));
    expect(kinds.every((kind) => ["reach", "interact", "survive", "pursue", "kill", "collect"].includes(kind))).toBe(true);
    expect(kinds.some((kind) => isCounterObjective(kind))).toBe(false);
  });
});
