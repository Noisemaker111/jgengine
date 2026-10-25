import { describe, expect, test } from "bun:test";

import { editorLayers } from "../../editorLayers";
import { seedPlacements, type SeedPlacement } from "./setup";

const ANCHORS: readonly SeedPlacement[] = [
  { catalogId: "ride_carousel", x: -20, z: 8 },
  { catalogId: "ride_coaster", x: 20, z: 4 },
  { catalogId: "stall_food", x: -12, z: 28 },
  { catalogId: "stall_food", x: 12, z: 28 },
];
const TRACK_PIECES = 14;

describe("brightway-park starter park (authored scene)", () => {
  test("the document seeds rides first, then track, then the rest", () => {
    const placements = seedPlacements();
    expect(placements.slice(0, ANCHORS.length)).toEqual([...ANCHORS]);
    const track = placements.slice(ANCHORS.length, ANCHORS.length + TRACK_PIECES);
    for (const piece of track) expect(piece.catalogId).toBe("track_piece");
    const rest = placements.slice(ANCHORS.length + TRACK_PIECES);
    expect(rest.length).toBe(editorLayers.markers.length - ANCHORS.length);
    for (const piece of rest) expect(piece.catalogId).not.toBe("track_piece");
  });

  test("every seeded placement lands on its own grid cell", () => {
    const cells = new Set<string>();
    for (const placement of seedPlacements()) {
      const key = `${placement.x},${placement.z}`;
      expect(cells.has(key)).toBe(false);
      cells.add(key);
    }
  });

  test("the authored document carries the seed content the runtime reads", () => {
    expect(editorLayers.markers).toHaveLength(seedPlacements().length - TRACK_PIECES);
    const track = editorLayers.paths.find((path) => path.id === "coaster-track");
    expect(track?.kind).toBe("route");
    expect(track?.points).toHaveLength(TRACK_PIECES);
  });
});
