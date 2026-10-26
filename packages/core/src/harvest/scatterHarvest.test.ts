import { describe, expect, test } from "bun:test";

import { createScatterClearing } from "../scatter/scatterClearing";
import { createScatterHarvest, type HarvestableDef } from "./scatterHarvest";

const KINDS: Record<string, HarvestableDef> = {
  tree: { budget: 3, resources: [{ kind: "wood", amount: 2 }, { kind: "thatch", amount: 3 }], respawn: 10, radius: 0.5 },
  rock: { budget: 2, resources: [{ kind: "stone", amount: 1 }, { kind: "flint", amount: 1 }], respawn: 10 },
};
const PLACEMENTS = [
  { id: "r/0", item: "tree", x: 0, z: 2 },
  { id: "r/1", item: "rock", x: 0, z: -2 },
  { id: "r/2", item: "grass", x: 0, z: 1 },
];
const HAND = { biases: { thatch: 1 }, defaultBias: 0 };
const HATCHET = { power: 1.5, biases: { wood: 1, thatch: 0.25 }, defaultBias: 0 };

describe("createScatterHarvest", () => {
  test("hits only what it faces, with the tool's bias", () => {
    const harvest = createScatterHarvest({ kinds: KINDS, rng: () => 0 });
    harvest.setPlacements(PLACEMENTS);
    expect(harvest.strike({ x: 0, z: 0, yaw: Math.PI / 2, reach: 2, tool: HAND })).toBeNull();
    const punch = harvest.strike({ x: 0, z: 0, yaw: 0, reach: 2, tool: HAND });
    expect(punch?.id).toBe("r/0");
    expect(punch?.granted).toEqual([{ kind: "thatch", amount: 3 }]);
    const chop = harvest.strike({ x: 0, z: 0, yaw: 0, reach: 2, tool: HATCHET });
    expect(chop?.granted).toEqual([{ kind: "wood", amount: 2 }, { kind: "thatch", amount: 0.75 }]);
    expect(harvest.strike({ x: 0, z: 0, yaw: Math.PI, reach: 2, tool: HAND })?.item).toBe("rock");
  });

  test("a spent node leaves the world and regrows", () => {
    const clearing = createScatterClearing();
    const harvest = createScatterHarvest({ kinds: KINDS, clearing, rng: () => 0 });
    harvest.setPlacements(PLACEMENTS);
    const swing = { x: 0, z: 0, yaw: 0, reach: 2, tool: HATCHET };
    harvest.strike(swing);
    expect(harvest.strike(swing)?.depleted).toBe(true);
    expect(clearing.hidden().has("r/0")).toBe(true);
    expect(harvest.strike(swing)).toBeNull();
    const saved = JSON.parse(JSON.stringify(harvest.snapshot()));
    expect(harvest.tick(10)).toEqual(["r/0"]);
    expect(clearing.hidden().size).toBe(0);
    harvest.restore(saved);
    expect(clearing.hidden().has("r/0")).toBe(true);
    harvest.reset();
    expect(harvest.isDepleted("r/0")).toBe(false);
  });
});
