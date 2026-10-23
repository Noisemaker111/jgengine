import { describe, expect, test } from "bun:test";

import { seededRng } from "../random/rng";
import {
  applyMissionRewards,
  createMissionRuntime,
  validateMissionCatalog,
  type MissionDef,
  type MissionMarkerProximity,
  type MissionRuntime,
} from "./mission";

const GATE = { x: 0, y: 0, z: 0 };
const VAULT = { x: 50, y: 0, z: 0 };
const EXIT = { x: -50, y: 0, z: 0 };
const MARKERS = { gate: GATE, vault: VAULT, exit: EXIT, depot: { x: 5, y: 0, z: 5 } };

/** Two routes through one gate: a quiet one and a loud one, chosen by an alarm fact. */
const BRANCHED: MissionDef = {
  id: "heist",
  title: "Heist",
  start: "approach",
  objectives: [
    {
      id: "approach",
      kind: "reach",
      actor: "player",
      marker: "gate",
      branches: [
        { to: "quiet", when: { fact: "alarm", atMost: 0 }, label: "quiet" },
        { to: "loud", when: { fact: "alarm", atLeast: 1 }, label: "loud" },
      ],
    },
    { id: "quiet", kind: "reach", actor: "player", marker: "vault", next: "done" },
    { id: "loud", kind: "reach", actor: "player", marker: "exit", next: "done" },
  ],
};

const TIMED: MissionDef = {
  id: "delivery",
  title: "Delivery",
  start: "deliver",
  objectives: [{ id: "deliver", kind: "reach", actor: "player", marker: "depot", timeout: 5, onTimeout: "too_slow" }],
  fail: [{ id: "too_slow", message: "out of time" }],
};

function runtime(
  missions: readonly MissionDef[],
  options: { rng?: () => number; proximity?: MissionMarkerProximity } = {},
): MissionRuntime {
  return createMissionRuntime({
    missions,
    markers: MARKERS,
    rng: options.rng,
    defaultPursuer: "player",
    markerProximity: options.proximity,
  });
}

const at = (point: { x: number; y: number; z: number }) => ({ player: { position: point } });

describe("mission state machine", () => {
  test("a branch takes a different path on a different input", () => {
    const quiet = runtime([BRANCHED]);
    quiet.start("heist");
    quiet.tick(1 / 60, { actors: at(GATE), facts: { alarm: 0 } });
    expect(quiet.state()!.path).toEqual(["approach", "quiet"]);

    const loud = runtime([BRANCHED]);
    loud.start("heist");
    loud.tick(1 / 60, { actors: at(GATE), facts: { alarm: 1 } });
    expect(loud.state()!.path).toEqual(["approach", "loud"]);
    expect(loud.state()!.path).not.toEqual(quiet.state()!.path);
  });

  test("a timer expires into a fail state", () => {
    const run = runtime([TIMED]);
    run.start("delivery");
    const events = run.tick(6, { actors: at(VAULT) });
    expect(events.map((event) => event.kind)).toEqual(["timeout", "failed"]);
    expect(run.state()!.status).toBe("failed");
    expect(run.state()!.outcome).toBe("too_slow");
    expect(run.state()!.reason).toBe("out of time");
  });

  test("a fail condition on a timer lands in its named state", () => {
    const mission: MissionDef = {
      id: "stakeout",
      title: "Stakeout",
      objectives: [{
        id: "watch",
        kind: "reach",
        actor: "player",
        marker: "depot",
        failOn: [{ kind: "timer", seconds: 3, to: "spotted", message: "spotted" }],
      }],
      fail: [{ id: "spotted" }],
    };
    const run = runtime([mission]);
    run.start("stakeout");
    run.tick(4, { actors: at(VAULT) });
    expect(run.state()!.outcome).toBe("spotted");
  });

  test("a fact fail condition reads a caller fact", () => {
    const mission: MissionDef = {
      id: "haul",
      title: "Haul",
      objectives: [{
        id: "carry",
        kind: "reach",
        actor: "player",
        marker: "depot",
        failOn: [{ kind: "fact", fact: "cargo", atMost: 0, to: "cargo_lost" }],
      }],
      fail: [{ id: "cargo_lost" }],
    };
    const run = runtime([mission]);
    run.start("haul");
    run.tick(1 / 60, { actors: at(VAULT), facts: { cargo: 2 } });
    expect(run.state()!.status).toBe("active");
    run.tick(1 / 60, { actors: at(VAULT), facts: { cargo: 0 } });
    expect(run.state()!.outcome).toBe("cargo_lost");
  });

  test("reaching the marker completes the mission and pays its rewards", () => {
    const mission: MissionDef = {
      id: "errand",
      title: "Errand",
      objectives: [{ id: "go", kind: "reach", actor: "player", marker: "gate", next: "done" }],
      rewards: { xp: { amount: 25 }, economy: { cash: 10 } },
    };
    const run = runtime([mission]);
    run.start("errand");
    const events = run.tick(1 / 60, { actors: at(GATE) });
    expect(events.some((event) => event.kind === "completed")).toBe(true);
    const reward = events.find((event) => event.kind === "reward");
    expect(reward?.kind === "reward" && reward.rewards.economy).toEqual({ cash: 10 });
    expect(run.state()!.status).toBe("completed");
  });

  test("kill and collect objectives count cumulative counters", () => {
    const mission: MissionDef = {
      id: "clear",
      title: "Clear",
      objectives: [
        { id: "raiders", kind: "kill", counter: "raider", count: 3, next: "loot" },
        { id: "loot", kind: "collect", counter: "crate", count: 2, next: "extract" },
        { id: "extract", kind: "reach", actor: "player", marker: "gate", next: "done" },
      ],
    };
    const run = runtime([mission]);
    run.start("clear");
    expect(run.tick(1 / 60, { counters: { raider: 2 } })).toEqual([]);
    const cleared = run.tick(1 / 60, { counters: { raider: 3 } });
    expect(cleared.some((event) => event.kind === "objective")).toBe(true);
    expect(run.state()!.objective).toBe("loot");
    run.tick(1 / 60, { counters: { raider: 3, crate: 2 } });
    expect(run.state()!.objective).toBe("extract");
    run.tick(1 / 60, { actors: at(GATE), counters: { raider: 3, crate: 2 } });
    expect(run.state()!.status).toBe("completed");
  });

  test("a mission's next chains the follow-up and starts it", () => {
    const first: MissionDef = {
      id: "one",
      title: "One",
      objectives: [{ id: "go", kind: "reach", actor: "player", marker: "gate", next: "done" }],
      next: "two",
    };
    const second: MissionDef = {
      id: "two",
      title: "Two",
      objectives: [{ id: "go", kind: "reach", actor: "player", marker: "depot", next: "done" }],
    };
    const run = runtime([first, second]);
    run.start("one");
    run.tick(1 / 60, { actors: at(GATE) });
    expect(run.state()!.missionId).toBe("two");
    expect(run.state()!.status).toBe("active");
  });

  test("a rollout fact is rolled once from the injected RNG and stays put", () => {
    const mission: MissionDef = {
      id: "route",
      title: "Route",
      rollout: { fact: "route", options: ["north", "south"] },
      objectives: [{ id: "go", kind: "reach", actor: "player", marker: "gate", next: "done" }],
    };
    const run = runtime([mission], { rng: seededRng("route-seed") });
    run.start("route");
    const rolled = run.state()!.facts.route;
    expect(["north", "south"]).toContain(rolled);
    run.tick(1 / 60, { actors: at(VAULT) });
    expect(run.state()!.facts.route).toBe(rolled);
  });

  test("the devtools probe reports the active mission", () => {
    const run = createMissionRuntime({ missions: [BRANCHED], markers: MARKERS, devtoolsName: "missions-test" });
    run.start("heist");
    run.tick(1 / 60, { actors: at(GATE), facts: { alarm: 0 } });
    expect(run.stats().started).toBe(1);
    expect(run.view()!.label).toBe("Reach vault");
    run.dispose();
  });

  test("snapshot then restore continues to the same end state", () => {
    const mission: MissionDef = {
      id: "hold",
      title: "Hold",
      objectives: [{ id: "hold", kind: "survive", duration: 4, next: "done" }],
    };
    const original = runtime([mission]);
    original.start("hold");
    original.tick(2, { survivors: 6 });
    const saved = original.snapshot();

    const resumed = runtime([mission]);
    resumed.restore(saved);
    resumed.tick(2, { survivors: 6 });
    original.tick(2, { survivors: 6 });

    expect(resumed.state()!.status).toBe("completed");
    expect(resumed.state()).toEqual(original.state());
    expect(resumed.state()!.score).toBe(original.state()!.score);
  });

  test("constructing a runtime over an invalid catalog throws, naming the issue", () => {
    const broken: MissionDef = {
      id: "broken",
      title: "Broken",
      objectives: [{ id: "go", kind: "reach", actor: "player" }],
    };
    expect(() => runtime([broken])).toThrow(/mission catalog invalid/);
    expect(() => runtime([broken])).toThrow(/missing-marker/);
  });

  test("signal completes an objective and fail lands a named state", () => {
    const run = runtime([BRANCHED]);
    run.start("heist");
    run.tick(1 / 60, { actors: at(GATE), facts: { alarm: 0 } });
    run.signal("heist", "quiet");
    expect(run.state()!.status).toBe("completed");

    const other = runtime([BRANCHED]);
    other.start("heist");
    other.fail("heist", "failed", "authored");
    expect(other.state()!.status).toBe("failed");
  });
});

describe("mission marker proximity", () => {
  const HILL: MissionDef = {
    id: "signal",
    title: "Signal",
    objectives: [{ id: "tower", kind: "reach", actor: "player", marker: "gate", next: "done" }],
  };

  test("an authored y=0 marker triggers from ground 6 m above it and not from 40 m away", () => {
    const near = runtime([HILL]);
    near.start("signal");
    near.tick(1 / 60, { actors: at({ x: 0, y: 6, z: 0 }) });
    expect(near.state()!.status).toBe("completed");

    const far = runtime([HILL]);
    far.start("signal");
    far.tick(1 / 60, { actors: at({ x: 40, y: 6, z: 0 }) });
    expect(far.state()!.status).toBe("active");
  });

  test("spatial mode still requires vertical proximity", () => {
    const run = runtime([HILL], { proximity: { plane: "spatial" } });
    run.start("signal");
    run.tick(1 / 60, { actors: at({ x: 0, y: 6, z: 0 }) });
    expect(run.state()!.status).toBe("active");
    run.tick(1 / 60, { actors: at({ x: 0, y: 0, z: 0 }) });
    expect(run.state()!.status).toBe("completed");
  });

  test("the horizontal tolerance holds at its boundary", () => {
    const inside = runtime([HILL], { proximity: { tolerance: 4 } });
    inside.start("signal");
    inside.tick(1 / 60, { actors: at({ x: 0, y: 3.999, z: 0 }) });
    expect(inside.state()!.status).toBe("completed");

    const outside = runtime([HILL], { proximity: { tolerance: 4 } });
    outside.start("signal");
    outside.tick(1 / 60, { actors: at({ x: 0, y: 4.001, z: 0 }) });
    expect(outside.state()!.status).toBe("active");
  });

  test("left-area reads the same plane, so ground below its marker does not fail the mission", () => {
    const mission: MissionDef = {
      id: "watch",
      title: "Watch",
      objectives: [{
        id: "hold",
        kind: "survive",
        actor: "player",
        duration: 10,
        failOn: [{ kind: "left-area", actor: "player", marker: "gate", radius: 4 }],
      }],
    };
    const run = runtime([mission]);
    run.start("watch");
    run.tick(1 / 60, { actors: at({ x: 0, y: 6, z: 0 }) });
    expect(run.state()!.status).toBe("active");
    run.tick(1 / 60, { actors: at({ x: 12, y: 6, z: 0 }) });
    expect(run.state()!.outcome).toBe("failed");
  });
});

describe("mission rewards", () => {
  test("economy, xp, items and unlocks route through the quest appliers; loot through the registry", () => {
    const calls: string[] = [];
    const fail = applyMissionRewards(
      {
        xp: { amount: 40 },
        economy: { cash: 12 },
        items: [{ item: "crate", count: 1, inventory: "pack" }],
        unlocks: ["docks"],
        loot: ["raider_table"],
      },
      {
        grantXp: (amount) => calls.push(`xp:${amount}`),
        grantEconomy: (id, amount) => calls.push(`cash:${id}:${amount}`),
        grantItems: (items) => {
          calls.push(`items:${items.length}`);
          return null;
        },
        grantUnlock: (id) => calls.push(`unlock:${id}`),
        grantLoot: (table) => calls.push(`loot:${table}`),
      },
    );
    expect(fail).toBeNull();
    expect(calls).toEqual(["items:1", "xp:40", "cash:cash:12", "unlock:docks", "loot:raider_table"]);
  });
});

describe("mission validation", () => {
  test("a counter-only mission is an error", () => {
    const counterOnly: MissionDef = {
      id: "bounty",
      title: "Bounty",
      objectives: [{ id: "kills", kind: "kill", counter: "raider", count: 5, next: "done" }],
    };
    const issues = validateMissionCatalog([counterOnly]);
    const issue = issues.find((entry) => entry.code === "counter-only");
    expect(issue?.severity).toBe("error");
    expect(issue?.missionId).toBe("bounty");
  });

  test("a counter-only path through a longer mission is still an error", () => {
    const sneaky: MissionDef = {
      id: "sneaky",
      title: "Sneaky",
      start: "kills",
      objectives: [
        { id: "kills", kind: "kill", counter: "raider", count: 2, next: "done" },
        { id: "detour", kind: "reach", actor: "player", marker: "gate", next: "done" },
      ],
    };
    expect(validateMissionCatalog([sneaky]).some((issue) => issue.code === "counter-only")).toBe(true);
  });

  test("a mission with a world condition on its success path is clean", () => {
    const mixed: MissionDef = {
      id: "mixed",
      title: "Mixed",
      start: "kills",
      objectives: [
        { id: "kills", kind: "kill", counter: "raider", count: 5, next: "escape" },
        { id: "escape", kind: "reach", actor: "player", marker: "gate", next: "done" },
      ],
    };
    const issues = validateMissionCatalog([mixed], { markerIds: Object.keys(MARKERS) });
    expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  test("unknown markers, missing fields and duplicate objectives are located", () => {
    const broken: MissionDef = {
      id: "broken",
      title: "Broken",
      start: "ghost",
      objectives: [
        { id: "go", kind: "reach", actor: "player", marker: "nowhere", next: "gone" },
        { id: "go", kind: "survive", next: "done" },
      ],
    };
    const issues = validateMissionCatalog([broken], { markerIds: Object.keys(MARKERS) });
    const codes = issues.map((issue) => issue.code);
    expect(codes).toContain("unknown-marker");
    expect(codes).toContain("missing-duration");
    expect(codes).toContain("duplicate-objective");
    expect(codes).toContain("unknown-objective");
    expect(codes).toContain("missing-start");
  });
});
