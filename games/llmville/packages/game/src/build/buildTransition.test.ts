import { describe, expect, test } from "bun:test";
import { decidePlaceBuildItem } from "@llmville/game/build/buildTransition";
import { normalizeBuildInventory } from "@llmville/game/build/catalog";
import { ownedCellsPolicy } from "@llmville/game/datacenter/claims";

describe("buildTransition", () => {
  test("decidePlaceBuildItem rejects unknown items", () => {
    const decision = decidePlaceBuildItem({
      itemId: "not_a_real_item",
      position: { x: 0, y: 0, z: 0 },
      direction: 0,
      inventory: normalizeBuildInventory(),
      context: {
        racks: [],
        placedBuildItems: [],
        cellPolicy: ownedCellsPolicy(new Set<string>()),
      },
      createdBy: "tester",
      now: 1,
    });
    expect(decision.placed).toBe(false);
    if (!decision.placed) {
      expect(decision.reason).toBe("Unknown build item");
    }
  });
});