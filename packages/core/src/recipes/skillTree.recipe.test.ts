import { expect, test } from "bun:test";

import { changeStatPool, createStatGraph, createStatPool, evaluatePredicate, type Predicate } from "../parts";

/**
 * @recipe Skill tree unlock
 * Skill points are a Meter, each node's prerequisite is a Requirement, and an unlocked node adds a Modifiers source.
 */
test("skill tree unlock", () => {
  let points = createStatPool({ max: 10, current: 2 });
  const sheet = createStatGraph({ inputs: [{ id: "health", base: 100 }] }).create();
  const nodes: Record<string, { needs: Predicate; health: number }> = {
    tough: { needs: { gte: ["level", 1] }, health: 20 },
    tougher: { needs: { includes: ["unlocked", "tough"] }, health: 30 },
  };
  const unlocked: string[] = [];
  const unlock = (id: string) => {
    const node = nodes[id];
    if (node === undefined || points.current < 1 || !evaluatePredicate(node.needs, { level: 1, unlocked })) return false;
    points = changeStatPool(points, -1).pool;
    sheet.addSource(id, { health: { source: id, op: "add", value: node.health } });
    unlocked.push(id);
    return true;
  };

  expect(unlock("tougher")).toBe(false);
  expect([unlock("tough"), unlock("tougher")]).toEqual([true, true]);
  expect(sheet.get("health")).toBe(150);
  expect(points.current).toBe(0);
});
