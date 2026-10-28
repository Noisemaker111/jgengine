import { describe, expect, test } from "bun:test";

import { compareRagdollFall, formatRagdollFall, humanRagdollConfig, INJURY_LIMITS, measureRagdollFall, stockHumanoidRagdoll } from "./compareRagdollFall";
import { simulateFall, validateHumanFall } from "./humanFall";

describe("fall reference", () => {
  test("a rigid fall strikes the head harder than a limp one, and past the injury limit", () => {
    const limp = simulateFall({ tone: "limp" });
    const rigid = simulateFall({ tone: "rigid" });
    expect(rigid.headImpactSpeed).toBeGreaterThan(limp.headImpactSpeed);
    expect(rigid.hic15).toBeGreaterThan(INJURY_LIMITS.hic15);
    expect(limp.pelvisTime).toBeLessThan(limp.headTime);
  }, 30_000);

  test("landing force grows with drop height", () => {
    const low = simulateFall({ tone: "landing", dropHeight: 0.3 });
    const high = simulateFall({ tone: "landing", dropHeight: 1 });
    expect(high.peakFootForce).toBeGreaterThan(low.peakFootForce);
    expect(Number.isNaN(low.headTime)).toBe(true);
  }, 30_000);

  test("published falls and landings pass", () => {
    const rows = validateHumanFall();
    expect(rows.filter((r) => !r.pass).map((r) => r.metric)).toEqual([]);
  }, 30_000);

  test("wobbling soft tissue softens a hard landing", () => {
    const wobbling = simulateFall({ tone: "landing", dropHeight: 1 });
    const rigid = simulateFall({ tone: "landing", dropHeight: 1, wobbling: null });
    expect(wobbling.peakFootForce).toBeLessThan(rigid.peakFootForce);
  }, 30_000);
});

describe("ragdoll fall compare", () => {
  test("the stock humanoid ragdoll is built from the engine's own rig table", () => {
    const stock = stockHumanoidRagdoll();
    expect(stock.bones.some((b) => b.name === "hips")).toBe(true);
    expect(stock.links.every((l) => l.kind === "distance")).toBe(true);
    const total = humanRagdollConfig(80).bones.reduce((sum, b) => sum + (b.mass ?? 1), 0);
    expect(total).toBeCloseTo(80, 6);
  }, 30_000);

  test("a toppled ragdoll hits the floor and the compare pairs it with the human", () => {
    const fall = measureRagdollFall();
    expect(fall.headImpactSpeed).toBeGreaterThan(1);
    const rows = compareRagdollFall();
    expect(rows.find((r) => r.metric === "hic15")?.limit).toBe(INJURY_LIMITS.hic15);
    expect(formatRagdollFall(rows).split("\n")).toHaveLength(rows.length + 2);
  }, 30_000);
});
