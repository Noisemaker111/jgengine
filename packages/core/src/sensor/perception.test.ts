import { describe, expect, test } from "bun:test";
import { createPerception, type PerceptionConfig } from "@jgengine/core/world";
import { createWorldSolids } from "@jgengine/core/world/worldSolids";
import { devtools } from "../devtools/devtools";

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
    const perception = createPerception({ sightRange: 10, sightConeDeg: 90, hearingRange: 5, memorySeconds: 2, isSegmentClear: () => false });
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

  test("judges a sound once, from where the observer stood when it heard it", () => {
    const perception = createPerception({ sightRange: 0, sightConeDeg: 0, hearingRange: 10, memorySeconds: 10 });
    perception.pushStimulus({ kind: "sound", sourceId: "player", position: [0, 0, 8], at: 1000 });
    perception.observe(observer, [], 1000);
    const first = perception.memory("guard")[0]!.confidence;
    expect(first).toBeCloseTo(0.2, 5);
    perception.observe({ ...observer, position: [0, 0, 7.9] }, [], 1000);
    expect(perception.memory("guard")[0]!.confidence).toBeCloseTo(first, 9);
    const saved = perception.snapshot();
    const copy = createPerception({ sightRange: 0, sightConeDeg: 0, hearingRange: 10, memorySeconds: 10 });
    copy.restore(saved);
    copy.observe({ ...observer, position: [0, 0, 7.9] }, [], 1000);
    const after = copy.snapshot();
    expect(after.memories).toEqual(saved.memories);
    expect(after.stimuli).toEqual(saved.stimuli);
    expect(after.heard).toEqual(saved.heard);
    expect(after.nowMs).toBe(saved.nowMs);
  });

  test("a future-dated stimulus is judged once its time arrives", () => {
    const perception = createPerception({ sightRange: 0, sightConeDeg: 0, hearingRange: 10, memorySeconds: 10 });
    perception.pushStimulus({ kind: "damage", sourceId: "sniper", position: [0, 0, 50], at: 2000 });
    perception.observe(observer, [], 1000);
    expect(perception.memory("guard")).toEqual([]);
    perception.observe(observer, [], 2000);
    expect(perception.memory("guard").map((memory) => memory.targetId)).toEqual(["sniper"]);
  });
});

const SENSES: PerceptionConfig = { sightRange: 10, sightConeDeg: 90, hearingRange: 0, memorySeconds: 5 };

describe("sight", () => {
  test("needs range, cone and a clear line — a wall hides the target", () => {
    const guard = { id: "guard", position: [0, 0, 0] as const, yaw: 0 };
    const clearOfWall = (from: readonly [number, number, number], to: readonly [number, number, number]): boolean =>
      Math.min(from[2], to[2]) < 4 && Math.max(from[2], to[2]) > 4 ? false : true;
    const perception = createPerception({ ...SENSES, isSegmentClear: clearOfWall });
    perception.observe(
      guard,
      [
        { id: "front", position: [0, 0, 3] },
        { id: "behind", position: [0, 0, -8] },
        { id: "far", position: [0, 0, 12] },
        { id: "side", position: [8, 0, 0] },
      ],
      0,
    );
    expect(perception.memory("guard").map((entry) => entry.targetId)).toEqual(["front"]);

    perception.observe(guard, [{ id: "behind-wall", position: [0, 0, 8] }], 10);
    expect(perception.memoryOf("guard", "behind-wall")).toBeNull();

    perception.observe({ ...guard, position: [0, 0, 5] }, [{ id: "open", position: [0, 0, 8] }], 20);
    expect(perception.memoryOf("guard", "open")).not.toBeNull();
  });

  test("pays for occlusion only on pairs already inside range and cone", () => {
    const guard = { id: "guard", position: [0, 0, 0] as const, yaw: 0 };
    let calls = 0;
    const perception = createPerception({ ...SENSES, isSegmentClear: () => (calls += 1) > 0 });
    const candidates = [];
    for (let i = 0; i < 100; i += 1) candidates.push({ id: `t${i}`, position: [i, 0, i % 2 === 0 ? 5 : -5] as const });
    perception.observe(guard, candidates, 0);
    const stats = perception.stats();
    expect(stats.pairChecks).toBe(100);
    expect(calls).toBe(stats.occlusionChecks);
    expect(stats.occlusionChecks).toBeLessThan(stats.coneTests);
    expect(stats.coneTests).toBeLessThan(stats.pairChecks);
  });

  test("a solid wall between eye and target hides it, and the same distance in the open does not", () => {
    const guard = { id: "guard", position: [0, 0, 0] as const, yaw: 0 };
    const solids = createWorldSolids();
    solids.set("building", [{ center: [0, 1, 4], halfExtents: [3, 1.5, 0.25] }]);
    const perception = createPerception({ ...SENSES, sightRange: 20, sightConeDeg: 120, solids });
    perception.observe(
      guard,
      [
        { id: "behind-wall", position: [0, 0, 8] },
        { id: "open", position: [8, 0, 8] },
      ],
      0,
    );
    expect(perception.memory("guard").map((memory) => memory.targetId)).toEqual(["open"]);
    expect(perception.memoryOf("guard", "behind-wall")).toBeNull();
  });

  test("a sight ray budget caps the per-pass wall tests and drops what it cannot check", () => {
    const guard = { id: "guard", position: [0, 0, 0] as const, yaw: 0 };
    const solids = createWorldSolids();
    solids.set("building", [{ center: [0, 1, 4], halfExtents: [3, 1.5, 0.25] }]);
    let rays = 0;
    const counted = {
      inBox: (min: readonly [number, number, number], max: readonly [number, number, number]) => solids.inBox(min, max),
      inRay: (origin: readonly [number, number, number], direction: readonly [number, number, number], maxDistance: number) => {
        rays += 1;
        return solids.inRay!(origin, direction, maxDistance);
      },
    };
    const perception = createPerception({ ...SENSES, sightRange: 20, sightConeDeg: 360, solids: counted, maxSightRaysPerPass: 3 });
    const candidates = Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, position: [i - 2.5, 0, 8] as const }));
    perception.observe(guard, candidates, 0);
    expect(rays).toBe(3);
    expect(perception.stats().occlusionChecks).toBe(3);
    expect(perception.stats()).toMatchObject({ occlusionDropped: 3 });
    expect(perception.memory("guard")).toEqual([]);
  });

  test("counters separate range prunes from cone tests", () => {
    const perception = createPerception(SENSES);
    perception.observe({ id: "guard", position: [0, 0, 0] as const, yaw: 0 }, [{ id: "far", position: [0, 0, 40] }], 0);
    expect(perception.stats()).toMatchObject({ pairChecks: 1, rangeCulled: 1, coneTests: 0, sightings: 0 });
    perception.resetStats();
    expect(perception.stats()).toMatchObject({ pairChecks: 0, rangeCulled: 0, passes: 1 });
  });
});

describe("hearing", () => {
  test("a sound fades with distance and is silent past its loudness range", () => {
    const perception = createPerception({ sightRange: 0, sightConeDeg: 0, hearingRange: 10, memorySeconds: 10 });
    perception.pushStimulus({ kind: "sound", sourceId: "near-shot", position: [0, 0, 5], loudness: 1, at: 1000 });
    perception.pushStimulus({ kind: "sound", sourceId: "edge", position: [0, 0, 10], loudness: 1, at: 1001 });
    perception.pushStimulus({ kind: "sound", sourceId: "soft-step", position: [0, 0, 3], loudness: 0.2, at: 1002 });
    perception.pushStimulus({ kind: "sound", sourceId: "quiet-step", position: [0, 0, 3], loudness: 0.4, at: 1003 });
    perception.observe(observer, [], 1004);
    const heard = perception.memory("guard");
    expect(heard.map((entry) => entry.targetId)).toEqual(["near-shot", "quiet-step"]);
    expect(heard[0]!.confidence).toBeCloseTo(0.5, 3);
    expect(heard[1]!.confidence).toBeCloseTo(0.25, 3);
    expect(perception.stats().heard).toBe(2);
  });
});

describe("memory", () => {
  test("a lost target is known while it decays and forgotten after memorySeconds", () => {
    const perception = createPerception({ sightRange: 20, sightConeDeg: 360, hearingRange: 0, memorySeconds: 4 });
    perception.observe(observer, [{ id: "player", position: [0, 0, 2] }], 0);
    perception.observe(observer, [], 2000);
    expect(perception.memoryOf("guard", "player")).toMatchObject({ confidence: 0.5, lastKnownPos: [0, 0, 2], lastSeenAt: 0 });
    perception.observe(observer, [], 3999);
    expect(perception.memoryOf("guard", "player")).not.toBeNull();
    perception.observe(observer, [], 4001);
    expect(perception.memoryOf("guard", "player")).toBeNull();
    expect(perception.memory("guard")).toEqual([]);
  });

  test("memory is the only claim of a recent sighting", () => {
    const perception = createPerception({ sightRange: 20, sightConeDeg: 120, hearingRange: 0, memorySeconds: 1 });
    perception.observe(observer, [{ id: "player", position: [0, 0, 2] }], 0);
    perception.observe(observer, [{ id: "player", position: [0, 0, -2] }], 500);
    expect(perception.memory("guard")).toHaveLength(1);
    expect(perception.memoryOf("guard", "player")).toMatchObject({ lastSeenAt: 0, lastKnownPos: [0, 0, 2] });
    perception.observe(observer, [], 1500);
    expect(perception.memory("guard")).toEqual([]);
  });
});

describe("squad knowledge", () => {
  const roster = (id: string): readonly string[] =>
    id === "alpha" ? ["bravo", "charlie"] : id === "bravo" ? ["alpha", "charlie"] : ["alpha", "bravo"];

  test("one member seeing a target updates the others with the source and tick", () => {
    const perception = createPerception({ ...SENSES, squadMates: roster });
    const alpha = { id: "alpha", position: [0, 0, 0] as const, yaw: 0 };
    perception.observe(alpha, [{ id: "player", position: [0, 0, 5] }], 1000);
    expect(perception.memory("bravo")).toMatchObject([{ targetId: "player", lastSeenAt: 1000, sourceId: "alpha", sourceTick: 1 }]);
    expect(perception.memory("charlie")[0]).toMatchObject({ sourceId: "alpha", sourceTick: 1 });
    expect(perception.memory("alpha")[0]).toMatchObject({ sourceId: "alpha", sourceTick: 1 });
    expect(perception.stats().shares).toBe(2);
  });

  test("a mate's own sighting replaces the hand-off", () => {
    const perception = createPerception({ ...SENSES, squadMates: roster });
    const alpha = { id: "alpha", position: [0, 0, 0] as const, yaw: 0 };
    const bravo = { id: "bravo", position: [4, 0, 5] as const, yaw: -Math.PI / 2 };
    perception.observe(alpha, [{ id: "player", position: [0, 0, 5] }], 1000);
    expect(perception.memory("bravo")[0]!.sourceId).toBe("alpha");
    perception.observe(bravo, [{ id: "player", position: [0, 0, 5] }], 1000);
    expect(perception.memory("bravo")[0]!.sourceId).toBe("bravo");
    expect(perception.memory("bravo")[0]!.sourceTick).toBe(2);
  });

  test("a large squad is capped per pass and the drops are counted", () => {
    const mates = Array.from({ length: 10 }, (_, index) => `m${index}`);
    const perception = createPerception({ ...SENSES, squadMates: () => mates, maxSharesPerTick: 4 });
    perception.observe(observer, [{ id: "a", position: [0, 0, 3] }, { id: "b", position: [0, 0, 4] }], 0);
    expect(perception.stats()).toMatchObject({ shares: 4, shareDropped: 16, sightings: 2 });
    expect(perception.memory("m0")).toHaveLength(1);
    expect(perception.memory("m9")).toHaveLength(0);
  });

  test("lone observers share nothing", () => {
    const perception = createPerception(SENSES);
    perception.observe(observer, [{ id: "a", position: [0, 0, 3] }], 0);
    expect(perception.stats().shares).toBe(0);
  });
});

describe("state", () => {
  test("snapshot round-trips memory provenance and keeps counting passes", () => {
    const roster = () => ["mate"];
    const perception = createPerception({ ...SENSES, squadMates: roster });
    perception.observe(observer, [{ id: "player", position: [0, 0, 5] }], 1000);
    const saved = perception.snapshot();
    expect(saved.memories).toContainEqual({ observerId: "mate", memory: expect.objectContaining({ sourceId: "guard", sourceTick: 1 }) });

    const copy = createPerception({ ...SENSES, squadMates: roster });
    copy.restore(saved);
    expect(copy.snapshot()).toEqual(saved);
    copy.observe(observer, [], 1200);
    expect(copy.stats().passes).toBe((saved.passes ?? 0) + 1);
    expect(copy.memory("mate")[0]!.sourceTick).toBe(1);
  });

  test("identical input yields identical state", () => {
    const run = () => {
      const perception = createPerception({ ...SENSES, squadMates: () => ["mate"] });
      perception.pushStimulus({ kind: "sound", sourceId: "shot", position: [0, 0, 6], loudness: 2, at: 500 });
      for (let pass = 0; pass < 5; pass += 1) {
        perception.observe({ id: "guard", position: [pass * 0.1, 0, 0] as const, yaw: 0.2 }, [{ id: "player", position: [0, 0, 5] }], 500 + pass * 100);
      }
      return perception.snapshot();
    };
    expect(run()).toEqual(run());
  });

  test("retuning rejects a negative share cap and dispose drops the probe", () => {
    const probed = createPerception({ ...SENSES, devtoolsName: "perception:test" });
    probed.observe(observer, [{ id: "player", position: [0, 0, 5] }], 0);
    expect(String(devtools.probes.read()["perception:test"])).toContain("1 observers 1 remembered");
    probed.dispose();
    expect(devtools.probes.read()["perception:test"]).toBeUndefined();
    expect(() => probed.retune({ maxSharesPerTick: -1 })).toThrow("maxSharesPerTick");
  });
});
