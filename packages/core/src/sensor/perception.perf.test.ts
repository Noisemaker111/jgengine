import { describe, expect, test } from "bun:test";
import { createPerception, type PerceptionPosition } from "@jgengine/core/world";
import { gateTimingMs } from "../../../../scripts/timing-budget";

const OBSERVERS = 200;
const TARGETS = 200;

interface Wall {
  readonly x: number;
  readonly z0: number;
  readonly z1: number;
}

const walls: Wall[] = [];
for (let i = 0; i < 20; i += 1) walls.push({ x: i * 8 - 4, z0: (i % 5) * 12, z1: (i % 5) * 12 + 14 });

/** True when no authored wall crosses the segment on the XZ plane. */
function isSegmentClear(from: PerceptionPosition, to: PerceptionPosition): boolean {
  for (const wall of walls) {
    const minX = Math.min(from[0], to[0]);
    const maxX = Math.max(from[0], to[0]);
    if (wall.x <= minX || wall.x >= maxX) continue;
    const t = (wall.x - from[0]) / (to[0] - from[0]);
    const z = from[2] + (to[2] - from[2]) * t;
    if (z >= wall.z0 && z <= wall.z1) return false;
  }
  return true;
}

function field(): { observers: { id: string; position: PerceptionPosition; yaw: number }[]; targets: { id: string; position: PerceptionPosition }[] } {
  const observers = [];
  const targets = [];
  for (let i = 0; i < OBSERVERS; i += 1) {
    observers.push({ id: `o${i}`, position: [4 + (i % 20) * 8, 0, 4 + Math.floor(i / 20) * 8] as PerceptionPosition, yaw: (i % 8) * (Math.PI / 4) });
  }
  for (let i = 0; i < TARGETS; i += 1) {
    targets.push({ id: `t${i}`, position: [8 + (i % 20) * 8, 0, 8 + Math.floor(i / 20) * 8] as PerceptionPosition });
  }
  return { observers, targets };
}

describe("perception budget", () => {
  test("200 observers against 200 targets stays under a millisecond per pass", () => {
    const { observers, targets } = field();
    const perception = createPerception({
      sightRange: 30,
      sightConeDeg: 100,
      hearingRange: 30,
      memorySeconds: 4,
      isSegmentClear,
    });

    for (let pass = 0; pass < 20; pass += 1) for (const observer of observers) perception.observe(observer, targets, pass * 50);
    perception.resetStats();

    const samples: number[] = [];
    for (let pass = 0; pass < 40; pass += 1) {
      const started = performance.now();
      for (const observer of observers) perception.observe(observer, targets, 2000 + pass * 50);
      samples.push(performance.now() - started);
    }

    const stats = perception.stats();
    expect(stats.pairChecks).toBe(OBSERVERS * TARGETS * 40);
    expect(stats.rangeCulled).toBeGreaterThan(0.8 * stats.pairChecks);
    expect(stats.occlusionChecks).toBeGreaterThan(0);
    expect(stats.occlusionChecks).toBeLessThan(stats.coneTests);

    // Fastest pass 0.71 ms idle (this machine, 2026-10-22).
    gateTimingMs(
      "perception pass, 200 observers x 200 targets",
      samples,
      1.5,
      `${stats.pairChecks / 40} pairs a pass, ${stats.rangeCulled / 40} range-culled, ` +
        `${stats.coneTests / 40} cone tests, ${stats.occlusionChecks / 40} line checks`,
    );
  }, 120_000);

  test("a squad roster is bounded by the per-pass share cap", () => {
    const { observers, targets } = field();
    const squads = Array.from({ length: OBSERVERS / 10 }, (_, squad) =>
      Array.from({ length: 10 }, (_, member) => `o${squad * 10 + member}`),
    );
    const mates = (id: string): readonly string[] => squads.find((squad) => squad.includes(id))!.filter((member) => member !== id);
    const perception = createPerception({
      sightRange: 30,
      sightConeDeg: 100,
      hearingRange: 0,
      memorySeconds: 4,
      isSegmentClear,
      squadMates: mates,
      maxSharesPerTick: 32,
    });

    for (const observer of observers) perception.observe(observer, targets, 0);
    const stats = perception.stats();
    const sharesPerPass = stats.shares / observers.length;
    console.log(`squad of 10, 200 observers: ${sharesPerPass.toFixed(1)} shares per observer pass, ${stats.shareDropped} dropped`);
    expect(sharesPerPass).toBeLessThanOrEqual(32);
    expect(stats.shareDropped).toBeGreaterThan(0);
    expect(perception.memory("o0").length).toBeGreaterThan(0);
  }, 120_000);
});
