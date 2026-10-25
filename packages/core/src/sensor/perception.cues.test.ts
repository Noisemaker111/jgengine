import { describe, expect, test } from "bun:test";
import { createPerception } from "@jgengine/core/world";

const hunter = { id: "courier", position: [0, 0, 0] as const, yaw: 0 };

describe("perception cues: light and scent", () => {
  test("a lit target is seen farther than sightRange and a dark one only up close", () => {
    const perception = createPerception({ sightRange: 10, sightConeDeg: 120, hearingRange: 0, memorySeconds: 5 });
    perception.observe(hunter, [
      { id: "lamp-on", position: [0, 0, 15], visibility: 1.6 },
      { id: "lamp-off", position: [0.5, 0, 6], visibility: 0.4 },
    ], 1000);
    expect(perception.memory("courier").map((memory) => memory.targetId)).toEqual(["lamp-on"]);
    expect(perception.memoryOf("courier", "lamp-on")?.cue).toBe("sight");
  });

  test("a scent carries scentRange times its strength, around corners, and names its cue", () => {
    const perception = createPerception({ sightRange: 10, sightConeDeg: 90, hearingRange: 4, scentRange: 12, memorySeconds: 5, isSegmentClear: () => false });
    perception.pushStimulus({ kind: "scent", sourceId: "bleeding", position: [0, 0, 18], loudness: 2, at: 1000 });
    perception.pushStimulus({ kind: "scent", sourceId: "graze", position: [0, 0, 9], loudness: 0.5, at: 1000 });
    perception.observe(hunter, [], 1000);
    const smelled = perception.memory("courier");
    expect(smelled.map((memory) => memory.targetId)).toEqual(["bleeding"]);
    expect(smelled[0]!.cue).toBe("scent");
    expect(smelled[0]!.confidence).toBeCloseTo(0.25, 5);
  });

  test("an observer with no scentRange smells nothing, and sounds keep their own cue", () => {
    const perception = createPerception({ sightRange: 0, sightConeDeg: 0, hearingRange: 10, memorySeconds: 5 });
    perception.pushStimulus({ kind: "scent", sourceId: "bleeding", position: [0, 0, 1], at: 1000 });
    perception.pushStimulus({ kind: "sound", sourceId: "sprinter", position: [0, 0, 5], at: 1000 });
    perception.observe(hunter, [], 1000);
    expect(perception.memory("courier").map((memory) => [memory.targetId, memory.cue])).toEqual([["sprinter", "sound"]]);
  });

  test("the cue survives a snapshot round trip", () => {
    const perception = createPerception({ sightRange: 0, sightConeDeg: 0, hearingRange: 0, scentRange: 10, memorySeconds: 5 });
    perception.pushStimulus({ kind: "scent", sourceId: "bleeding", position: [0, 0, 2], at: 1000 });
    perception.observe(hunter, [], 1000);
    const copy = createPerception({ sightRange: 0, sightConeDeg: 0, hearingRange: 0, scentRange: 10, memorySeconds: 5 });
    copy.restore(perception.snapshot());
    expect(copy.memoryOf("courier", "bleeding")?.cue).toBe("scent");
  });

  test("rejects a negative visibility or scent range", () => {
    expect(() => createPerception({ sightRange: 1, sightConeDeg: 90, hearingRange: 1, scentRange: -1, memorySeconds: 1 })).toThrow("scentRange must be non-negative.");
    const perception = createPerception({ sightRange: 10, sightConeDeg: 90, hearingRange: 0, memorySeconds: 1 });
    expect(() => perception.observe(hunter, [{ id: "x", position: [0, 0, 1], visibility: -1 }], 0)).toThrow("candidate.visibility must be non-negative.");
  });
});
