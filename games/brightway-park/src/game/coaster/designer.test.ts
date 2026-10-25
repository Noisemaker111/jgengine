import { describe, expect, test } from "bun:test";

import { canAppend, isClosed, launchCell, LOOP_SPEED, platformCells, STYLES, testRun, walkLayout, type PieceType, type Station } from "./designer";

const station: Station = { cell: [19, 15], size: 2, heading: 0 };
/** Two lifts up, a drop back down, round a rectangle into the station's back. */
const ring: PieceType[] = ["lift", "lift", "straight", "right", "down", "down", "right", "straight", "straight", "straight", "straight", "straight", "right", "straight", "straight", "right"];

describe("coaster designer", () => {
  test("track leaves the station's front and is closed when it comes back into its back at ground level", () => {
    expect(platformCells(station)).toEqual([[19, 15], [20, 15]]);
    expect(launchCell(station)).toEqual([21, 15]);
    expect(isClosed(station, ring)).toBe(true);
    expect(isClosed(station, ring.slice(0, -1))).toBe(false);
    const { pieces } = walkLayout(station, ring);
    expect(pieces[2]).toMatchObject({ cell: [23, 15], level: 2, heading: 0 });
    expect(pieces[4]).toMatchObject({ cell: [24, 16], level: 2, heading: 1 });
  });

  test("a test run measures the ride: speed from the drop, ratings from what the train felt", () => {
    const run = testRun(station, ring, STYLES.wooden);
    expect(run.ok).toBe(true);
    expect(run.maxDrop).toBe(4);
    expect(run.topSpeed).toBeGreaterThan(8);
    expect(run.excitement).toBeGreaterThan(3);
    expect(run.intensity).toBeGreaterThan(2);
    expect(run.lapSeconds).toBeGreaterThan(10);
    // The same track as a junior coaster is gentler.
    const junior = testRun(station, ring, STYLES.junior);
    expect(junior.intensity).toBeLessThan(run.intensity);
  });

  test("an open track fails its test run and scores nothing", () => {
    const run = testRun(station, ring.slice(0, 5), STYLES.wooden);
    expect(run.ok).toBe(false);
    expect(run.failure).toContain("doesn't come back");
    expect(run.excitement).toBe(0);
  });

  test("a climb with no speed rolls back; a loop needs speed to get over the top", () => {
    const stall: PieceType[] = ["up", "up", "up", "right", "right", "down", "down", "down", "straight", "straight", "right", "right"];
    const rolled = testRun(station, stall, STYLES.steel);
    expect(rolled.ok).toBe(false);
    expect(rolled.failure).toContain("rolled back");
    const slowLoop: PieceType[] = ring.map((piece, i) => (i === 2 ? "loop" : piece));
    const run = testRun(station, slowLoop, STYLES.steel);
    expect(run.failure).toContain(`${LOOP_SPEED} m/s`);
  });

  test("a style only takes its own pieces and heights; nothing goes through what is already built", () => {
    const free = () => true;
    expect(canAppend(station, [], "loop", STYLES.wooden, free)).toContain("can't have a loop");
    expect(canAppend(station, [], "loop", STYLES.steel, free)).toBeNull();
    expect(canAppend(station, ["lift", "lift", "lift"], "lift", STYLES.junior, free)).toContain("Too high");
    expect(canAppend(station, [], "down", STYLES.steel, free)).toContain("below the ground");
    expect(canAppend(station, [], "straight", STYLES.steel, () => false)).toContain("in the way");
    expect(canAppend(station, ring, "straight", STYLES.steel, free)).toContain("complete");
  });
});
