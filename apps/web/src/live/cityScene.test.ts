import { describe, expect, test } from "bun:test";

import { generateCity } from "@jgengine/core/world/cityGenerator";
import { extractCircuitRoute, type CircuitRoute } from "@jgengine/core/world/raceCircuit";
import { buildRaceDressing, cityRevealState } from "./cityScene";

describe("city road reveal ordering", () => {
  test("pavement and sidewalk ribbons reveal before aprons, markings, glow, or traffic", () => {
    const early = cityRevealState(0.65);
    expect(early.ribbonProgress).toBeGreaterThan(0);
    expect(early.ribbonProgress).toBeLessThan(1);
    expect(early.junctionsVisible).toBe(false);
    expect(early.dressingOpacity).toBe(0);

    const complete = cityRevealState(1.3);
    expect(complete.ribbonProgress).toBe(1);
    expect(complete.junctionsVisible).toBe(true);
    expect(complete.dressingOpacity).toBeGreaterThan(0);
  });

  test("instant capture state resolves every layer in one frame", () => {
    expect(cityRevealState(0, true)).toEqual({
      ribbonProgress: 1,
      junctionsVisible: true,
      dressingOpacity: 1,
    });
  });
});

function raceFixture(): CircuitRoute {
  const city = generateCity(
    {
      seed: "vice-isle",
      streets: { gridness: 0.7, loopiness: 0.5, connectivity: 0.55, branching: 0.3, boulevards: 0.35, segmentLength: 100 },
    },
    260,
    260,
  );
  const route = extractCircuitRoute(city.network, { seed: "vice-isle", lapLength: 2400 });
  if (route === null) throw new Error("fixture city has no drivable lap");
  return route;
}

describe("street race dressing", () => {
  test("emits the racing surface and one striped barrier run per sealed side street", () => {
    const route = raceFixture();
    const meshes = buildRaceDressing(route, () => 0);
    const surface = meshes.find((mesh) => mesh.name === "race-surface");
    const seals = meshes.find((mesh) => mesh.name === "race-seals");
    expect(surface).toBeDefined();
    expect(seals).toBeDefined();
    expect(surface!.geometry.getIndex()!.count).toBeGreaterThan(route.centerline.length * 6);
    expect(route.seals.length).toBeGreaterThan(0);
    // Each barrier run is several boxes, and every box is five faces of four vertices.
    expect(seals!.geometry.getAttribute("position").count).toBeGreaterThan(route.seals.length * 60);
  });

  test("keeps every painted vertex on the lap — a corner must not splay the ribbon", () => {
    const route = raceFixture();
    const surface = buildRaceDressing(route, () => 0).find((mesh) => mesh.name === "race-surface")!;
    const margin = Math.max(...route.widths) / 2 + 2;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of route.centerline) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    surface.geometry.computeBoundingBox();
    const box = surface.geometry.boundingBox!;
    expect(box.min.x).toBeGreaterThanOrEqual(minX - margin);
    expect(box.max.x).toBeLessThanOrEqual(maxX + margin);
    expect(box.min.z).toBeGreaterThanOrEqual(minZ - margin);
    expect(box.max.z).toBeLessThanOrEqual(maxZ + margin);
  });
});
