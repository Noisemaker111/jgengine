import { describe, expect, test } from "bun:test";
import { createPerception } from "@jgengine/core/sensor/perception";

const observer = { id: "guard", position: [0, 0, 0] as const, yaw: 0 };

describe("createPerception", () => {
  test("remembers a seen target after it leaves the cone", () => {
    const perception = createPerception({ sightRange: 10, sightConeDeg: 90, hearingRange: 5, memorySeconds: 2 });
    perception.observe(observer, [{ id: "player", position: [0, 0, 5] }], 1000);
    perception.observe(observer, [{ id: "player", position: [5, 0, 0] }], 1500);
    expect(perception.memory("guard")).toMatchObject([{ targetId: "player", lastSeenAt: 1000, confidence: 0.75 }]);
  });

  test("sound stimulus creates memory without sight", () => {
    const perception = createPerception({ sightRange: 10, sightConeDeg: 30, hearingRange: 10, memorySeconds: 2 });
    perception.pushStimulus({ kind: "sound", sourceId: "player", position: [0, 0, 4], loudness: 1, at: 1000 });
    perception.observe(observer, [{ id: "player", position: [4, 0, 0] }], 1000);
    expect(perception.memory("guard")).toMatchObject([{ targetId: "player", lastSeenAt: 1000 }]);
  });

  test("occluder blocks sight", () => {
    const perception = createPerception({ sightRange: 10, sightConeDeg: 90, hearingRange: 5, memorySeconds: 2, occluded: () => true });
    perception.observe(observer, [{ id: "player", position: [0, 0, 5] }], 1000);
    expect(perception.memory("guard")).toEqual([]);
  });
});
