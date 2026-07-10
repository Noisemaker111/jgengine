import { describe, expect, test } from "bun:test";
import { forecastPlayerEdgeAt, isSingleTrackOccupied, projectConflict } from "./conflict";
import { edgeLength, edgeById } from "./network";
import { trainById, trainPositionAt, TRAINS } from "./schedule";

describe("single-track occupancy rule", () => {
  test("the tunnel is occupied exactly when a train's edgeT is strictly inside it", () => {
    const local = trainById("local");
    let sawOccupied = false;
    let sawFree = false;
    for (let t = 0; t < 60; t += 0.25) {
      const occupied = isSingleTrackOccupied("e-j2-j3", [local], t);
      const pose = trainPositionAt(local, t);
      const expected = pose.edgeId === "e-j2-j3" && pose.edgeT > 0.04 && pose.edgeT < 0.96;
      expect(occupied).toBe(expected);
      if (occupied) sawOccupied = true;
      else sawFree = true;
    }
    expect(sawOccupied).toBe(true);
    expect(sawFree).toBe(true);
  });

  test("a non-single-track edge is never reported occupied", () => {
    for (let t = 0; t < 30; t += 1) {
      expect(isSingleTrackOccupied("e-depot-j1", TRAINS, t)).toBe(false);
    }
  });

  test("an empty edge with no trains scheduled on it is never occupied", () => {
    for (let t = 0; t < 30; t += 1) {
      expect(isSingleTrackOccupied("e-j3-j4", [trainById("freight-lowdale")], t)).toBe(false);
    }
  });
});

describe("player forecast", () => {
  test("advances along the authored upcoming route at constant speed", () => {
    const edge = edgeById("e-j2-j3");
    const length = edgeLength(edge);
    const forecast = forecastPlayerEdgeAt(
      { currentEdgeId: "e-j2-j3", edgeT: 0, speed: length / 2, upcomingEdgeIds: ["e-j3-j4"] },
      1,
    );
    expect(forecast).not.toBeNull();
    expect(forecast!.edgeId).toBe("e-j2-j3");
    expect(forecast!.edgeT).toBeCloseTo(0.5, 4);
  });

  test("crosses into the next edge once the current one is exhausted", () => {
    const currentLength = edgeLength(edgeById("e-j2-j3"));
    const remainingOnCurrent = 0.1 * currentLength;
    const forecast = forecastPlayerEdgeAt(
      { currentEdgeId: "e-j2-j3", edgeT: 0.9, speed: remainingOnCurrent + 15, upcomingEdgeIds: ["e-j3-j4"] },
      1,
    );
    expect(forecast).not.toBeNull();
    expect(forecast!.edgeId).toBe("e-j3-j4");
    expect(forecast!.edgeT).toBeCloseTo(0.5, 4);
  });
});

describe("conflict projection correctness", () => {
  test("a parked player in the middle of a busy single-track edge finds an eventual conflict, and the projected time matches the train's real position", () => {
    const local = trainById("local");
    const projection = projectConflict(
      { currentEdgeId: "e-j2-j3", edgeT: 0.5, speed: 0, upcomingEdgeIds: [] },
      [local],
      0,
      60,
      0.05,
    );
    expect(projection).not.toBeNull();
    expect(projection!.edgeId).toBe("e-j2-j3");
    const actual = trainPositionAt(local, projection!.atSeconds);
    expect(actual.edgeId).toBe("e-j2-j3");
    expect(Math.abs(actual.edgeT - 0.5)).toBeLessThanOrEqual(0.15);
  });

  test("an edge with zero scheduled traffic within the horizon projects no conflict", () => {
    const projection = projectConflict(
      { currentEdgeId: "e-j3-ridge2", edgeT: 0.5, speed: 0, upcomingEdgeIds: [] },
      TRAINS,
      0,
      15,
      0.1,
    );
    expect(projection).toBeNull();
  });
});
