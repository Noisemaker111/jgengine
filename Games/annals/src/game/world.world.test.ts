import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";
import { aabbOverlap } from "@jgengine/core/world/geometry";

import { settlements } from "./settlements";
import { world } from "../world";

// The Annals is built from a prompt by Ethan Mollick (https://x.com/emollick). Play it at https://annals-kingdom.netlify.app/.
describe("annals world", () => {
  const summary = summarizeEnvironment(world);

  test("renders a populated kingdom scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("has rolling terrain with finite relief", () => {
    expect(summary.counts.terrain).toBe(1);
    expect(summary.terrain?.height.finite).toBe(true);
    expect(summary.terrain?.height.max).toBeGreaterThan(summary.terrain?.height.min ?? 0);
  });

  test("sites one structure cluster per settlement, centered near its position", () => {
    expect(summary.counts.structureGroups).toBe(3);
    expect(summary.counts.buildings).toBe(14);
    expect(summary.counts.buildingParts).toBeGreaterThan(0);

    summary.structures.forEach((structure, index) => {
      const settlement = settlements[index]!;
      const centerX = (structure.bounds.minX + structure.bounds.maxX) / 2;
      const centerZ = (structure.bounds.minZ + structure.bounds.maxZ) / 2;
      expect(Math.abs(centerX - settlement.position.x)).toBeLessThan(40);
      expect(Math.abs(centerZ - settlement.position.z)).toBeLessThan(40);
    });
  });

  test("settlement structure clusters do not overlap each other", () => {
    for (let i = 0; i < summary.structures.length; i += 1) {
      for (let j = i + 1; j < summary.structures.length; j += 1) {
        expect(aabbOverlap(summary.structures[i]!.bounds, summary.structures[j]!.bounds)).toBe(false);
      }
    }
  });

  test("has grass vegetation and a water body", () => {
    expect(summary.counts.vegetationFields).toBe(1);
    expect(summary.counts.waterBodies).toBe(1);
  });
});
