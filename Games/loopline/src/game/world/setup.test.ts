import { describe, expect, test } from "bun:test";

import { editorLayers } from "../../editorLayers";
import { seedPlacements, type SeedPlacement } from "./setup";

const RIDES: readonly SeedPlacement[] = [
  { catalogId: "ride_carousel", x: -20, z: 8 },
  { catalogId: "ride_coaster", x: 20, z: 4 },
  { catalogId: "stall_food", x: -12, z: 28 },
  { catalogId: "stall_food", x: 12, z: 28 },
];
const TRACK_LOOP: readonly [number, number][] = [
  [28, 4], [28, 8], [28, 12], [28, 16], [24, 16], [20, 16], [16, 16], [16, 12], [16, 8], [16, 4],
];
const PATHS: readonly [number, number][] = [
  [0, 48], [0, 44], [0, 40], [0, 36], [0, 32], [0, 28], [0, 24], [0, 20], [0, 16],
  [-4, 20], [4, 20], [-4, 28], [-8, 28], [4, 28], [8, 28], [-4, 12], [-8, 12], [4, 12], [8, 12],
];
const TREES: readonly [number, number][] = [
  [-32, 12], [32, 12], [-28, -8], [28, 28], [-20, 32], [20, 32], [-8, -12], [8, -12],
  [-16, 44], [16, 44], [-32, 32], [32, 32], [-24, -12], [24, -12], [0, -12], [-32, -20],
];

const EXPECTED: readonly SeedPlacement[] = [
  ...RIDES,
  ...TRACK_LOOP.map(([x, z]) => ({ catalogId: "track_piece", x, z })),
  ...PATHS.map(([x, z]) => ({ catalogId: "path_walk", x, z })),
  ...TREES.map(([x, z]) => ({ catalogId: "deco_tree", x, z })),
];

describe("loopline starter park (authored scene)", () => {
  test("the editor document yields the exact pre-migration placements, in order", () => {
    expect(seedPlacements()).toEqual([...EXPECTED]);
  });

  test("the authored document carries the seed content the runtime reads", () => {
    expect(editorLayers.markers).toHaveLength(RIDES.length + PATHS.length + TREES.length);
    const track = editorLayers.paths.find((path) => path.id === "coaster-track");
    expect(track?.kind).toBe("route");
    expect(track?.points).toHaveLength(TRACK_LOOP.length);
  });
});
