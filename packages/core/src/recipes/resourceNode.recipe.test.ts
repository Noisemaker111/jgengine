import { expect, test } from "bun:test";

import { createRefillSlots, pickWeighted } from "../parts";
import { seededRng } from "../random/rng";

/**
 * @recipe Respawning resource node
 * Slots hold one node per spot and make it ready again a while after it is mined; a Table picks what it yields.
 */
test("respawning resource node", () => {
  const rng = seededRng("ore");
  const nodes = createRefillSlots({ slots: ["vein-a", "vein-b"], refillSeconds: [60, 120] }, rng);
  const yields = [{ item: "iron", weight: 4 }, { item: "gold", weight: 1 }];
  const mine = (node: string, now: number) => {
    nodes.empty(node, now);
    return pickWeighted(rng, yields, (y) => y.weight)?.item;
  };

  for (const node of nodes.ready(0)) nodes.fill(node);
  expect(nodes.ready(0)).toEqual([]);
  expect(["iron", "gold"]).toContain(mine("vein-a", 10));
  expect(nodes.isFilled("vein-a")).toBe(false);
  expect(nodes.ready(69)).toEqual([]);
  expect(nodes.ready(131)).toEqual(["vein-a"]);
});
