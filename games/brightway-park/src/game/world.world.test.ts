import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";

import { editorLayers } from "../editorLayers";
import { world } from "../world";

describe("brightway-park world", () => {
  const summary = summarizeEnvironment(world);

  test("renders a populated scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("frames the park with three building clusters from the scene, not procedural boxes", () => {
    expect(summary.counts.buildings).toBe(0);
    const town = editorLayers.markers.filter((marker) => marker.kind === "scenery" && marker.id.startsWith("town-"));
    for (const side of ["north", "west", "east"]) expect(town.filter((marker) => marker.id.startsWith(`town-${side}-`)).length).toBeGreaterThanOrEqual(4);
    for (const marker of town) expect(String(marker.meta?.["assetId"])).toStartWith("quaternius-lowpoly-buildings-pack/");
  });

  test("has finite, resolvable terrain", () => {
    expect(summary.terrain?.height.finite).toBe(true);
  });

  test("uses this game's own look, not engine defaults", () => {
    expect(summary.terrain?.palette.low).not.toBe("#30402c");
  });

  test("the world consumes editor terrain with a distinct clear circulation surface and one grass owner", () => {
    expect(world.kind === "environment" ? world.sculpt : undefined).toBe(editorLayers.terrain);
    expect(world.kind === "environment" ? world.vegetation : undefined).toBeUndefined();
    expect(editorLayers.volumes.filter(volume => volume.kind === "grass_field").length).toBe(1);
    const painted = editorLayers.terrain!;
    const surfaceAt = (x: number, z: number) => painted.surfaces[Math.floor((z - painted.bounds.minZ) / painted.cellSize) * painted.cols + Math.floor((x - painted.bounds.minX) / painted.cellSize)];
    expect(surfaceAt(0, 30)).toBe("sand");
    expect(surfaceAt(-20, 8)).toBe("gravel");
    expect(surfaceAt(40, 30)).toBe("grass");
  });
});
