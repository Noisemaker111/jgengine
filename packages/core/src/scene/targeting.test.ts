import { describe, expect, test } from "bun:test";
import { createTargeting } from "@jgengine/core/scene/targeting";

function hostileMobs(hostiles: string[]) {
  return (_fromId: string, toId: string) => (hostiles.includes(toId) ? ("hostile" as const) : ("friendly" as const));
}

describe("targeting", () => {
  test("setTarget and getTarget round-trip, null clears", () => {
    const targeting = createTargeting({ candidates: () => ["a", "b"] });
    expect(targeting.getTarget("player")).toBeNull();
    targeting.setTarget("player", "a");
    expect(targeting.getTarget("player")).toBe("a");
    targeting.setTarget("player", null);
    expect(targeting.getTarget("player")).toBeNull();
  });

  test("cycleTarget walks candidates in order, skipping self, and wraps", () => {
    const targeting = createTargeting({ candidates: () => ["player", "a", "b", "c"] });
    expect(targeting.cycleTarget("player")).toBe("a");
    expect(targeting.cycleTarget("player")).toBe("b");
    expect(targeting.cycleTarget("player")).toBe("c");
    expect(targeting.cycleTarget("player")).toBe("a");
  });

  test("cycleTarget prev starts at the end and walks backwards", () => {
    const targeting = createTargeting({ candidates: () => ["a", "b", "c"] });
    expect(targeting.cycleTarget("player", { direction: "prev" })).toBe("c");
    expect(targeting.cycleTarget("player", { direction: "prev" })).toBe("b");
  });

  test("cycleTarget honors hostile and friendly filters via classify", () => {
    const targeting = createTargeting({
      candidates: () => ["mob-1", "ally-1", "mob-2"],
      classify: hostileMobs(["mob-1", "mob-2"]),
    });
    expect(targeting.cycleTarget("player", { filter: "hostile" })).toBe("mob-1");
    expect(targeting.cycleTarget("player", { filter: "hostile" })).toBe("mob-2");
    expect(targeting.cycleTarget("player", { filter: "friendly" })).toBe("ally-1");
  });

  test("cycleTarget with no eligible candidates clears and returns null", () => {
    const targeting = createTargeting({
      candidates: () => ["ally-1"],
      classify: hostileMobs([]),
    });
    targeting.setTarget("player", "ally-1");
    expect(targeting.cycleTarget("player", { filter: "hostile" })).toBeNull();
    expect(targeting.getTarget("player")).toBeNull();
  });

  test("cycleTarget uses injected ordering", () => {
    const targeting = createTargeting({
      candidates: () => ["b", "c", "a"],
      orderBy: (x, y) => x.localeCompare(y),
    });
    expect(targeting.cycleTarget("player")).toBe("a");
    expect(targeting.cycleTarget("player")).toBe("b");
  });

  test("cycleTarget honors maxDistance when distance is injected", () => {
    const distances: Record<string, Record<string, number>> = {
      player: { near: 12, far: 55, ally: 8 },
    };
    const targeting = createTargeting({
      candidates: () => ["near", "far", "ally"],
      classify: hostileMobs(["near", "far"]),
      distance: (fromId, toId) => distances[fromId]?.[toId] ?? null,
    });
    expect(targeting.cycleTarget("player", { filter: "hostile", maxDistance: 40 })).toBe("near");
    expect(targeting.cycleTarget("player", { filter: "hostile", maxDistance: 40 })).toBe("near");
    expect(
      targeting.cycleTarget("player", { filter: "hostile", maxDistance: 40, direction: "prev" }),
    ).toBe("near");
  });

  test("cycleTarget with maxDistance and no in-range candidates clears target", () => {
    const targeting = createTargeting({
      candidates: () => ["far"],
      classify: hostileMobs(["far"]),
      distance: () => 80,
    });
    targeting.setTarget("player", "far");
    expect(targeting.cycleTarget("player", { filter: "hostile", maxDistance: 40 })).toBeNull();
    expect(targeting.getTarget("player")).toBeNull();
  });

  test("clearAll drops the entity's target and anyone targeting it", () => {
    const targeting = createTargeting({ candidates: () => ["mob-1", "player", "npc"] });
    targeting.setTarget("player", "mob-1");
    targeting.setTarget("npc", "mob-1");
    targeting.setTarget("mob-1", "player");
    targeting.clearAll("mob-1");
    expect(targeting.getTarget("player")).toBeNull();
    expect(targeting.getTarget("npc")).toBeNull();
    expect(targeting.getTarget("mob-1")).toBeNull();
  });
});
