import { describe, expect, test } from "bun:test";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";
import { TERRAIN_MATERIAL_PALETTES } from "@jgengine/core/terrain/terrain";
import { readGrassLook } from "@jgengine/core/grass/grassKind";

import { editorLayers } from "../editorLayers";
import { world } from "../world";
import { TERRAIN } from "./world/terrain";

describe("beacon-bastion world", () => {
  test("world is an environment feature", () => {
    expect(world.kind).toBe("environment");
  });

  const summary = summarizeEnvironment(world.kind === "environment" ? world : { kind: "environment" });

  test("renders a populated, non-empty scene", () => {
    expect(summary.isEmpty).toBe(false);
  });

  test("declares one authored grass field without an overlapping runtime grass layer", () => {
    expect(summary.counts.terrain).toBe(1);
    expect(summary.counts.vegetationFields).toBe(0);
    const grass = editorLayers.volumes.filter(volume => volume.kind === "grass_field");
    expect(grass.length).toBe(1);
    expect(readGrassLook(grass[0]!.meta).blade.widthVariation).toBeGreaterThan(0);
  });

  test("terrain has finite relief", () => {
    expect(summary.terrain?.height.finite).toBe(true);
    expect(summary.terrain?.height.max).toBeGreaterThan(summary.terrain?.height.min ?? 0);
  });

  test("terrain uses this game's own lawn palette, not an engine default", () => {
    expect(summary.terrain?.palette.low).toBe("#5a9a3e");
    expect(summary.terrain?.palette).not.toEqual(TERRAIN_MATERIAL_PALETTES.grass);
    expect(summary.terrain?.palette).not.toEqual(TERRAIN_MATERIAL_PALETTES.highland);
  });

  test("authored terrain survives the adapter: concrete sidewalks along the street, lawn everywhere else", () => {
    expect(TERRAIN.detail).toBeDefined();
    expect(world.kind === "environment" ? world.sculpt : undefined).toBe(editorLayers.terrain);
    const painted = editorLayers.terrain!;
    const surfaceAt = (x: number, z: number) => painted.surfaces[Math.floor((z - painted.bounds.minZ) / painted.cellSize) * painted.cols + Math.floor((x - painted.bounds.minX) / painted.cellSize)];
    expect(surfaceAt(-30, -12)).toBe("gravel");
    expect(surfaceAt(-36, -15.2)).toBe("gravel");
    expect(surfaceAt(-32, 26)).toBe("grass");
    expect(surfaceAt(0, -30)).toBe("grass");
    expect(new Set(painted.surfaces)).toEqual(new Set(["grass", "gravel"]));
    // A small town's lawns swell gently; the old highland mounds are a third of their height.
    expect(Math.max(...painted.offsets)).toBeCloseTo(0.84);
    expect(painted.offsets.filter(value => value !== 0).length).toBe(548);
  });
});
