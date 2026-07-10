import { describe, expect, test } from "bun:test";
import { createDecayMeterSet } from "@jgengine/core/survival/decayMeter";
import type { Waypoint } from "@jgengine/core/nav/pathFollow";
import { windField } from "@jgengine/core/world/wind";
import type { TerrainField } from "@jgengine/core/world/terrain";

import { WATER_MAX } from "../caravan/water";
import { WIND_SHIFT_SECONDS, type WindShift } from "../wind/schedule";
import {
  applyRaceFinish,
  beginRun,
  cancelDockChoice,
  commitDock,
  initialRunState,
  openDockChoice,
  pinFlag,
  resolveRaceOutcome,
  stepRun,
  toggleMap,
  unpinFlag,
  type RunDeps,
  type RunInput,
} from "./runState";

const FLAT_FIELD: TerrainField = { sampleHeight: () => 0, sampleNormal: () => [0, 1, 0] as const };

function windlessSchedule(): readonly WindShift[] {
  return [
    {
      index: 0,
      directionRad: 0,
      direction: [0, 1],
      speed: 0,
      field: windField({ direction: [0, 1], speed: 0 }),
    },
  ];
}

const STRAIGHT_WAYPOINTS: readonly Waypoint[] = [
  [0, 0, 1050],
  [0, 0, -1080],
];

function freshDeps(overrides: Partial<RunDeps> = {}): RunDeps {
  return {
    terrainField: FLAT_FIELD,
    windSchedule: windlessSchedule(),
    rivalWaypoints: STRAIGHT_WAYPOINTS,
    waterMeter: createDecayMeterSet([{ id: "water", max: WATER_MAX, start: WATER_MAX, rate: 1 }]),
    ...overrides,
  };
}

const NEUTRAL_INPUT: RunInput = { urge: false, ease: false, steerLeft: false, steerRight: false };

describe("initialRunState", () => {
  test("two fresh states do not share array references", () => {
    const a = initialRunState("playing", STRAIGHT_WAYPOINTS);
    const b = initialRunState("playing", STRAIGHT_WAYPOINTS);
    expect(a.followers).not.toBe(b.followers);
    expect(a.trail).not.toBe(b.trail);
    expect(a.water).toBe(WATER_MAX);
    expect(a.phase).toBe("playing");
  });

  test("starts at the south gate heading toward the city", () => {
    const state = initialRunState("start", STRAIGHT_WAYPOINTS);
    expect(state.player.x).toBe(0);
    expect(state.player.z).toBe(1050);
  });
});

describe("stepRun", () => {
  test("is a no-op outside the playing phase", () => {
    const state = initialRunState("start", STRAIGHT_WAYPOINTS);
    const next = stepRun(state, 1, NEUTRAL_INPUT, freshDeps());
    expect(next).toBe(state);
  });

  test("does not mutate the input state object", () => {
    const state = initialRunState("playing", STRAIGHT_WAYPOINTS);
    const before = JSON.stringify(state);
    stepRun(state, 0.5, NEUTRAL_INPUT, freshDeps());
    expect(JSON.stringify(state)).toBe(before);
  });

  test("advances the player and drains water over time", () => {
    const state = initialRunState("playing", STRAIGHT_WAYPOINTS);
    const next = stepRun(state, 1, NEUTRAL_INPUT, freshDeps());
    expect(next.player.z).not.toBe(state.player.z);
    expect(next.water).toBeLessThan(state.water);
    expect(next.elapsed).toBeCloseTo(1, 5);
  });

  test("the rival advances along its route independently of the player", () => {
    const state = initialRunState("playing", STRAIGHT_WAYPOINTS);
    const next = stepRun(state, 2, NEUTRAL_INPUT, freshDeps());
    expect(next.rival.position[2]).not.toBe(state.rival.position[2]);
    expect(next.rival.distanceTravelled).toBeGreaterThan(0);
  });

  test("strands the caravan when water hits zero", () => {
    const state = initialRunState("playing", STRAIGHT_WAYPOINTS);
    const next = stepRun(state, 500, NEUTRAL_INPUT, freshDeps());
    expect(next.water).toBe(0);
    expect(next.phase).toBe("stranded");
    expect(next.reason).toBe("water");
  });

  test("urging forward covers more ground per tick than easing off", () => {
    const state = initialRunState("playing", STRAIGHT_WAYPOINTS);
    const urging = stepRun(state, 1, { ...NEUTRAL_INPUT, urge: true }, freshDeps());
    const easing = stepRun(state, 1, { ...NEUTRAL_INPUT, ease: true }, freshDeps());
    const urgeDistance = Math.abs(urging.player.z - state.player.z);
    const easeDistance = Math.abs(easing.player.z - state.player.z);
    expect(urgeDistance).toBeGreaterThan(easeDistance);
  });

  test("freezes travel and pauses water drain while docked", () => {
    let state = initialRunState("playing", STRAIGHT_WAYPOINTS);
    state = openDockChoice(state, "bitter-well");
    state = commitDock(state, "quick");
    const deps = freshDeps();
    const next = stepRun(state, 5, NEUTRAL_INPUT, deps);
    expect(next.player.x).toBe(state.player.x);
    expect(next.player.z).toBe(state.player.z);
    expect(next.water).toBe(state.water);
    expect(next.dock?.elapsed).toBeCloseTo(5, 5);
  });

  test("completing a quick top-up refills water and clears the dock", () => {
    let state = initialRunState("playing", STRAIGHT_WAYPOINTS);
    const deps = freshDeps({
      waterMeter: createDecayMeterSet([{ id: "water", max: WATER_MAX, start: 10, rate: 1 }]),
    });
    state = { ...state, water: 10 };
    state = openDockChoice(state, "last-water");
    state = commitDock(state, "quick");
    const next = stepRun(state, 16, NEUTRAL_INPUT, deps);
    expect(next.dock).toBeNull();
    expect(next.water).toBeGreaterThan(10);
  });

  test("followers stay ordered behind the lead camel over time", () => {
    let state = initialRunState("playing", STRAIGHT_WAYPOINTS);
    const deps = freshDeps();
    for (let i = 0; i < 80; i += 1) {
      state = stepRun(state, 0.25, { ...NEUTRAL_INPUT, urge: true }, deps);
    }
    const distances = state.followers.map((follower) =>
      Math.hypot(follower.x - state.player.x, follower.z - state.player.z),
    );
    expect(distances[0]!).toBeLessThan(distances[3]!);
    expect(state.stragglers.every((straggling) => straggling === false)).toBe(true);
  });
});

describe("dock command reducers", () => {
  test("openDockChoice then cancel leaves no dock state", () => {
    let state = initialRunState("playing", STRAIGHT_WAYPOINTS);
    state = openDockChoice(state, "palm-hollow");
    expect(state.dockChoice?.oasisId).toBe("palm-hollow");
    state = cancelDockChoice(state);
    expect(state.dockChoice).toBeNull();
    expect(state.dock).toBeNull();
  });

  test("commitDock records the oasis as visited", () => {
    let state = initialRunState("playing", STRAIGHT_WAYPOINTS);
    state = openDockChoice(state, "widows-cistern");
    state = commitDock(state, "full");
    expect(state.oasesVisited).toContain("widows-cistern");
    expect(state.dock?.kind).toBe("full");
  });
});

describe("map flags", () => {
  test("pins up to three flags and ignores a fourth", () => {
    let state = initialRunState("playing", STRAIGHT_WAYPOINTS);
    state = pinFlag(state, { x: 1, z: 1 });
    state = pinFlag(state, { x: 2, z: 2 });
    state = pinFlag(state, { x: 3, z: 3 });
    state = pinFlag(state, { x: 4, z: 4 });
    expect(state.flags).toHaveLength(3);
  });

  test("unpin removes exactly one flag by index", () => {
    let state = initialRunState("playing", STRAIGHT_WAYPOINTS);
    state = pinFlag(state, { x: 1, z: 1 });
    state = pinFlag(state, { x: 2, z: 2 });
    state = unpinFlag(state, 0);
    expect(state.flags).toEqual([{ x: 2, z: 2 }]);
  });

  test("toggleMap flips mapOpen", () => {
    const state = initialRunState("playing", STRAIGHT_WAYPOINTS);
    expect(toggleMap(state).mapOpen).toBe(true);
    expect(toggleMap(toggleMap(state)).mapOpen).toBe(false);
  });
});

describe("beginRun", () => {
  test("moves from start to playing", () => {
    const state = initialRunState("start", STRAIGHT_WAYPOINTS);
    expect(beginRun(state).phase).toBe("playing");
  });

  test("is a no-op once already playing", () => {
    const state = initialRunState("playing", STRAIGHT_WAYPOINTS);
    expect(beginRun(state)).toBe(state);
  });
});

describe("race outcome", () => {
  test("the player winning the race wins the run", () => {
    expect(resolveRaceOutcome("player")).toEqual({ phase: "won", reason: null });
  });

  test("the rival winning the race strands the run", () => {
    expect(resolveRaceOutcome("rival")).toEqual({ phase: "stranded", reason: "rival" });
  });

  test("applyRaceFinish records the finish time and water margin", () => {
    let state = initialRunState("playing", STRAIGHT_WAYPOINTS);
    state = { ...state, elapsed: 240, water: 62 };
    const next = applyRaceFinish(state, "player");
    expect(next.phase).toBe("won");
    expect(next.finishSeconds).toBe(240);
    expect(next.finishWaterFraction).toBeCloseTo(0.62, 5);
  });

  test("applyRaceFinish is a no-op once the run already ended", () => {
    let state = initialRunState("playing", STRAIGHT_WAYPOINTS);
    state = applyRaceFinish(state, "player");
    const again = applyRaceFinish(state, "rival");
    expect(again).toBe(state);
  });
});
