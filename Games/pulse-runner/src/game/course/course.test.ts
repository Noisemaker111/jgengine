import { describe, expect, test } from "bun:test";

import {
  COURSE_LENGTH,
  MOVEMENTS,
  MOVEMENT_START_Z,
  buildMovementChart,
  gapTileMotif,
  gradeForAccuracy,
  worldZFor,
  type MotifSpec,
} from "./course";

describe("obstacle chart determinism", () => {
  test("a motif is a pure function of its beat index and lane", () => {
    expect(gapTileMotif(12, 1)).toEqual(gapTileMotif(12, 1));
    expect(gapTileMotif(12, 1)[0]!.beatIndex).toBe(12);
    expect(gapTileMotif(12, 1)[0]!.blockedLanes).toEqual([1]);
  });

  test("building the same chart twice yields identical output", () => {
    const cycle: readonly MotifSpec[] = [
      { kind: "gap", lane: 0 },
      { kind: "door" },
      { kind: "narrows", beats: 3, openLane: 1 },
    ];
    const config = { introBeats: 8, outroBeats: 4, totalBeats: 64, gapBeats: 4, cycle };
    expect(buildMovementChart(config, "test")).toEqual(buildMovementChart(config, "test"));
  });

  test("obstacle beat positions never fall inside the intro or outro margins", () => {
    const cycle: readonly MotifSpec[] = [{ kind: "gap", lane: 0 }, { kind: "door" }];
    const config = { introBeats: 10, outroBeats: 6, totalBeats: 60, gapBeats: 3, cycle };
    const chart = buildMovementChart(config, "test");
    for (const event of chart) {
      expect(event.beatIndex).toBeGreaterThanOrEqual(10);
      expect(event.beatIndex).toBeLessThan(60 - 6);
    }
  });

  test("chart events are sorted ascending by beat index", () => {
    for (const movement of MOVEMENTS) {
      for (let i = 1; i < movement.obstacles.length; i += 1) {
        expect(movement.obstacles[i]!.beatIndex).toBeGreaterThanOrEqual(movement.obstacles[i - 1]!.beatIndex);
      }
    }
  });

  test("blocked lanes are always within the 3-lane range", () => {
    for (const movement of MOVEMENTS) {
      for (const event of movement.obstacles) {
        for (const lane of event.blockedLanes) {
          expect(lane).toBeGreaterThanOrEqual(0);
          expect(lane).toBeLessThanOrEqual(2);
        }
      }
    }
  });
});

describe("movement sequencing + checkpoints", () => {
  test("three movements with rising BPM", () => {
    expect(MOVEMENTS).toHaveLength(3);
    expect(MOVEMENTS[0]!.bpm).toBe(90);
    expect(MOVEMENTS[1]!.bpm).toBe(110);
    expect(MOVEMENTS[2]!.bpm).toBe(128);
  });

  test("at least six distinct obstacle motifs appear across the course", () => {
    const types = new Set(MOVEMENTS.flatMap((movement) => movement.obstacles.map((event) => event.type)));
    expect(types.size).toBeGreaterThanOrEqual(6);
  });

  test("each movement contains real authored obstacle content", () => {
    for (const movement of MOVEMENTS) {
      expect(movement.obstacles.length).toBeGreaterThan(0);
    }
  });

  test("obstacle ids are unique across every movement", () => {
    const ids = MOVEMENTS.flatMap((movement) => movement.obstacles.map((event) => event.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("movement start offsets are monotonically increasing and non-overlapping", () => {
    for (let i = 1; i < MOVEMENT_START_Z.length; i += 1) {
      expect(MOVEMENT_START_Z[i]!).toBeGreaterThan(MOVEMENT_START_Z[i - 1]!);
    }
  });

  test("worldZFor places each movement's local origin at its start offset", () => {
    MOVEMENTS.forEach((_, index) => {
      expect(worldZFor(index, 0)).toBe(-COURSE_LENGTH / 2 + MOVEMENT_START_Z[index]!);
    });
  });

  test("the course length is the sum of every movement's length", () => {
    const expected = MOVEMENTS.reduce((sum, movement) => sum + movement.totalBeats * movement.unitsPerBeat, 0);
    expect(COURSE_LENGTH).toBe(expected);
  });
});

describe("grade computation", () => {
  test("boundary accuracies resolve to the expected grade", () => {
    expect(gradeForAccuracy(1)).toBe("S");
    expect(gradeForAccuracy(0.95)).toBe("S");
    expect(gradeForAccuracy(0.949)).toBe("A");
    expect(gradeForAccuracy(0.85)).toBe("A");
    expect(gradeForAccuracy(0.849)).toBe("B");
    expect(gradeForAccuracy(0.7)).toBe("B");
    expect(gradeForAccuracy(0.699)).toBe("C");
    expect(gradeForAccuracy(0)).toBe("C");
  });
});
