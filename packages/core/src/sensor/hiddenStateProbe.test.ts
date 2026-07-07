import { describe, expect, test } from "bun:test";
import { probeHiddenState, probeHiddenStateAll, type HiddenStateSource } from "@jgengine/core/sensor/hiddenStateProbe";

const ROOM_A: HiddenStateSource = { id: "room-a", position: [0, 0, 0], variables: { ghostType: "poltergeist", activity: 0.8 } };
const ROOM_B: HiddenStateSource = { id: "room-b", position: [20, 0, 0], variables: { activity: 0.2 } };

describe("hiddenStateProbe", () => {
  test("reads a hidden variable within range", () => {
    const reading = probeHiddenState([2, 0, 0], [ROOM_A], { range: 5, variableId: "ghostType" });
    expect(reading).not.toBeNull();
    expect(reading!.sourceId).toBe("room-a");
    expect(reading!.value).toBe("poltergeist");
  });

  test("returns null out of range", () => {
    expect(probeHiddenState([100, 0, 0], [ROOM_A], { range: 5, variableId: "ghostType" })).toBeNull();
  });

  test("returns null when the source lacks the variable", () => {
    expect(probeHiddenState([1, 0, 0], [ROOM_B], { range: 50, variableId: "ghostType" })).toBeNull();
  });

  test("strength falls off linearly with distance by default", () => {
    const atSource = probeHiddenState([0, 0, 0], [ROOM_A], { range: 10, variableId: "activity" });
    const atEdge = probeHiddenState([10, 0, 0], [ROOM_A], { range: 10, variableId: "activity" });
    const midway = probeHiddenState([5, 0, 0], [ROOM_A], { range: 10, variableId: "activity" });
    expect(atSource!.strength).toBe(1);
    expect(atEdge!.strength).toBe(0);
    expect(midway!.strength).toBeCloseTo(0.5, 5);
  });

  test("falloff none reads full strength anywhere in range", () => {
    const reading = probeHiddenState([9, 0, 0], [ROOM_A], { range: 10, variableId: "activity", falloff: "none" });
    expect(reading!.strength).toBe(1);
  });

  test("probeHiddenStateAll returns every in-range source sorted strongest-first", () => {
    const readings = probeHiddenStateAll([5, 0, 0], [ROOM_A, ROOM_B], { range: 30, variableId: "activity" });
    expect(readings.map((r) => r.sourceId)).toEqual(["room-a", "room-b"]);
  });
});
