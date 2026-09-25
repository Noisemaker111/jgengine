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

  test("loudness scales how far a sound carries", () => {
    const perception = createPerception({ sightRange: 0, sightConeDeg: 0, hearingRange: 10, memorySeconds: 5 });
    perception.pushStimulus({ kind: "sound", sourceId: "sneaker", position: [0, 0, 6], loudness: 0.5, at: 1000 });
    perception.pushStimulus({ kind: "sound", sourceId: "shooter", position: [0, 0, 30], loudness: 4, at: 1000 });
    perception.observe(observer, [], 1000);
    const heard = perception.memory("guard");
    expect(heard.map((memory) => memory.targetId)).toEqual(["shooter"]);
    expect(heard[0]!.confidence).toBeCloseTo(0.25, 5);
  });

  test("keeps stimuli time-ordered and bounded by maxStimuli", () => {
    const perception = createPerception({ sightRange: 0, sightConeDeg: 0, hearingRange: 100, memorySeconds: 60, maxStimuli: 3 });
    for (const at of [1000, 1400, 1200, 1300, 1100]) perception.pushStimulus({ kind: "sound", sourceId: `s${at}`, position: [0, 0, 1], at });
    expect(perception.snapshot().stimuli.map((stimulus) => stimulus.at)).toEqual([1200, 1300, 1400]);
    perception.retune({ maxStimuli: 1 });
    expect(perception.snapshot().stimuli.map((stimulus) => stimulus.at)).toEqual([1400]);
    expect(() => perception.retune({ maxStimuli: 0 })).toThrow("maxStimuli");
  });

  test("forgets one target or a whole observer", () => {
    const perception = createPerception({ sightRange: 10, sightConeDeg: 360, hearingRange: 0, memorySeconds: 5 });
    perception.observe(observer, [{ id: "a", position: [0, 0, 2] }, { id: "b", position: [0, 0, 3] }], 1000);
    perception.forget("guard", "a");
    expect(perception.memory("guard").map((memory) => memory.targetId)).toEqual(["b"]);
    perception.forget("guard");
    expect(perception.memory("guard")).toEqual([]);
    expect(perception.snapshot().memories).toEqual([]);
  });
});
