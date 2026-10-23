import { describe, expect, test } from "bun:test";

import { createPerception, type PerceptionCandidate } from "@jgengine/core/sensor/perception";
import { createSoundHunt, type SoundHunter } from "@jgengine/core/ai/director/sound";

const hearingRange = 20;

function setup(
  hunters: readonly SoundHunter[],
  options: { memorySeconds?: number; maxInvestigators?: number; sightRange?: number } = {},
) {
  const perception = createPerception({
    sightRange: options.sightRange ?? 0,
    sightConeDeg: 180,
    hearingRange,
    memorySeconds: options.memorySeconds ?? 4,
  });
  const hunt = createSoundHunt({
    perception,
    hearingRange,
    maxInvestigators: options.maxInvestigators ?? 3,
    hunters: () => hunters,
  });
  return { perception, hunt };
}

function observe(
  perception: ReturnType<typeof createPerception>,
  hunters: readonly SoundHunter[],
  at: number,
  candidates: readonly PerceptionCandidate[] = [],
): void {
  for (const hunter of hunters) {
    perception.observe({ id: hunter.id, position: hunter.position, yaw: 0 }, candidates, at);
  }
}

const roster: readonly SoundHunter[] = [
  { id: "h1", position: [0, 0, 0] },
  { id: "h2", position: [18, 0, 0] },
  { id: "h3", position: [40, 0, 0] },
];

describe("sound hunting", () => {
  test("a noise sends the nearest enemies, bounded", () => {
    const { perception, hunt } = setup(roster, { maxInvestigators: 2 });
    const admitted = hunt.noise({ sourceId: "player", position: [3, 0, 0], at: 0, loudness: 1 });
    expect(admitted).toEqual(["h1", "h2"]);
    observe(perception, roster, 0);
    const investigations = hunt.investigations(0);
    expect(investigations.map((entry) => entry.hunterId)).toEqual(["h1", "h2"]);
    expect(investigations[0]!.confidence).toBeGreaterThan(investigations[1]!.confidence);
    expect(investigations[0]!.sourceId).toBe("player");
  });

  test("an enemy outside the hearing range never joins the hunt", () => {
    const { perception, hunt } = setup(roster, { maxInvestigators: 3 });
    hunt.noise({ sourceId: "player", position: [3, 0, 0], at: 0 });
    observe(perception, roster, 0);
    expect(hunt.investigations(0).map((entry) => entry.hunterId)).toEqual(["h1", "h2"]);
  });

  test("a loud noise is heard further", () => {
    const { perception, hunt } = setup(roster, { maxInvestigators: 3 });
    const admitted = hunt.noise({ sourceId: "player", position: [3, 0, 0], at: 0, loudness: 2.2 });
    expect(admitted).toEqual(["h1", "h2", "h3"]);
    observe(perception, roster, 0);
    expect(hunt.investigations(0)).toHaveLength(3);
  });

  test("memory decays with age and the hunt ends when it is gone", () => {
    const { perception, hunt } = setup(roster, { maxInvestigators: 1, memorySeconds: 4 });
    hunt.noise({ sourceId: "player", position: [3, 0, 0], at: 0 });
    observe(perception, roster, 0);
    const fresh = hunt.investigations(0)[0]!;
    observe(perception, roster, 2000);
    const later = hunt.investigations(2000)[0]!;
    expect(later.confidence).toBeLessThan(fresh.confidence);
    expect(later.ageSeconds).toBe(2);
    observe(perception, roster, 4000);
    expect(hunt.investigations(4000)).toHaveLength(0);
    expect(hunt.snapshot().entries).toHaveLength(0);
  });

  test("a hunter gives up once the memory is too weak to follow", () => {
    const perception = createPerception({ sightRange: 0, sightConeDeg: 180, hearingRange, memorySeconds: 60 });
    const hunt = createSoundHunt({
      perception,
      hearingRange,
      maxInvestigators: 3,
      giveUpConfidence: 0.5,
      hunters: () => roster,
    });
    hunt.noise({ sourceId: "player", position: [0, 0, 0], at: 0 });
    observe(perception, roster, 0);
    // h2 heard it at 1 - 18/20 = 0.1 confidence, already under the give-up threshold.
    expect(hunt.investigations(0).map((entry) => entry.hunterId)).toEqual(["h1"]);
  });

  test("a fresh sighting during the hunt raises the same memory instead of resetting the hunt", () => {
    const { perception, hunt } = setup(roster, { maxInvestigators: 1, memorySeconds: 4, sightRange: 10 });
    hunt.noise({ sourceId: "player", position: [3, 0, 0], at: 0 });
    observe(perception, roster, 0);
    observe(perception, roster, 3000);
    expect(hunt.investigations(3000)[0]!.confidence).toBeLessThan(0.5);
    observe(perception, roster, 3000, [{ id: "player", position: [1, 0, 0] }]);
    const seen = hunt.investigations(3000)[0]!;
    expect(seen.confidence).toBe(1);
    expect(seen.position[0]).toBe(1);
  });

  test("a second noise sends nearest hunters, and one hunter works one noise", () => {
    const { perception, hunt } = setup(roster, { maxInvestigators: 2 });
    hunt.noise({ sourceId: "player", position: [3, 0, 0], at: 0 });
    const admitted = hunt.noise({ sourceId: "player", position: [14, 0, 0], at: 500 });
    expect(admitted).toEqual(["h2", "h1"]);
    observe(perception, roster, 500);
    const investigations = hunt.investigations(500);
    expect(new Set(investigations.map((entry) => entry.hunterId)).size).toBe(investigations.length);
    expect(investigations).toHaveLength(2);
  });

  test("the hunt survives a save and restore", () => {
    const { perception, hunt } = setup(roster, { maxInvestigators: 2 });
    hunt.noise({ sourceId: "player", position: [3, 0, 0], at: 0 });
    observe(perception, roster, 0);
    const snapshot = hunt.snapshot();
    observe(perception, roster, 1000);
    const before = hunt.investigations(1000);
    const restored = createSoundHunt({ perception, hearingRange, hunters: () => roster });
    restored.restore(snapshot);
    expect(restored.investigations(1000)).toEqual(before);
  });

  test("a noise with a non-finite time is rejected", () => {
    const { hunt } = setup(roster);
    expect(() => hunt.noise({ sourceId: "player", position: [0, 0, 0], at: Number.NaN })).toThrow();
  });
});
