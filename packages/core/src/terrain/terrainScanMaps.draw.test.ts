import { expect, test } from "bun:test";

import { resolveTerrainDetail } from "@jgengine/core/terrain/terrain";
import type { TerrainMaterialMaps } from "@jgengine/core/world/features";

import { createTerrainDetailMaterial, createTerrainSurfaceTextures } from "./terrainDetailMaterial.draw";
import { packTerrainScan, terrainScanKey, terrainScanRequests } from "./terrainScanMaps.draw";
import { createTerrainPaintTextures, packTerrainPaintWeights } from "./terrainSurfaces.draw";
import { createEditableTerrain } from "./terraform";

function plane(size: number, rows: (y: number) => readonly [number, number, number, number]): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) out.set(rows(y), (y * size + x) * 4);
  return out;
}

function paintWeights(editable: Parameters<typeof packTerrainPaintWeights>[0]): NonNullable<ReturnType<typeof packTerrainPaintWeights>> {
  const weights = packTerrainPaintWeights(editable);
  if (weights === undefined) throw new Error("terrain has no paint grid");
  return weights;
}

const MAPS_A: TerrainMaterialMaps = { color: "/m/a/color.jpg", normal: "/m/a/normal.jpg", roughness: "/m/a/roughness.jpg", ao: "/m/a/ao.jpg", displacement: "/m/a/displacement.jpg" };
const MAPS_B: TerrainMaterialMaps = { color: "/m/b/color.jpg", normal: "/m/b/normal.jpg" };

test("a scan packs into the surface layout with rows flipped to v-up", () => {
  const packed = packTerrainScan({
    size: 2,
    color: plane(2, (y) => [y === 0 ? 255 : 0, 0, 0, 255]),
    normal: plane(2, () => [200, 90, 255, 255]),
    roughness: plane(2, () => [0, 100, 0, 255]),
    ao: plane(2, () => [50, 50, 50, 255]),
    displacement: plane(2, (y) => [y === 0 ? 255 : 0, 0, 0, 255]),
  });
  expect(packed.size).toBe(2);
  expect([...packed.albedo.slice(0, 4)]).toEqual([0, 0, 0, 0]);
  expect([...packed.albedo.slice(8, 12)]).toEqual([255, 0, 0, 255]);
  expect([...packed.surface.slice(0, 4)]).toEqual([200, 90, 100, 50]);
  expect(packed.meanLinear[0]).toBeCloseTo(0.5, 5);
});

test("a map the scan does not ship keeps a neutral value", () => {
  const packed = packTerrainScan({ size: 2, color: plane(2, () => [255, 255, 255, 255]) });
  expect([...packed.surface.slice(0, 4)]).toEqual([128, 128, 217, 255]);
  expect(packed.albedo[3]).toBe(128);
  expect(packed.meanLinear[1]).toBeCloseTo(1, 5);
});

test("distinct scans are requested once across roles and paint layers", () => {
  const detail = resolveTerrainDetail({ surfaces: { ground: { scan: MAPS_A }, rock: { preset: "cliff" } } });
  const requests = terrainScanRequests(detail.surfaces, [MAPS_A, MAPS_B, undefined]);
  expect(requests.map(terrainScanKey)).toEqual([terrainScanKey(MAPS_A), terrainScanKey(MAPS_B)]);
  expect(detail.surfaces?.ground?.scan).toBe(MAPS_A);
  expect(detail.scanTriplanarAngle).toBe(45);
  expect(resolveTerrainDetail({ scanTriplanarAngle: 200 }).scanTriplanarAngle).toBe(85);
});

test("scanned roles and paint layers stack into one array and compile their projection", () => {
  const detail = resolveTerrainDetail({ scanTriplanarAngle: 30, surfaces: { ground: { scan: MAPS_A } } });
  const pack = (shade: number) => packTerrainScan({ size: 4, color: plane(4, () => [shade, shade, shade, 255]) });
  const scans = new Map([[terrainScanKey(MAPS_A), pack(40)], [terrainScanKey(MAPS_B), pack(200)]]);
  const surfaces = createTerrainSurfaceTextures(detail.surfaces, 1, [undefined, MAPS_B, MAPS_A], scans);
  expect(surfaces?.textures.albedo.image.depth).toBe(2);
  expect(surfaces?.roles.ground?.layer).toBe(0);
  expect(surfaces?.paintLayers).toEqual([undefined, 1, 0]);
  const editable = createEditableTerrain({ bounds: { minX: 0, minZ: 0, maxX: 8, maxZ: 8 }, cellSize: 2 });
  editable.setLayers([{ id: "a", surface: "grass", tiling: 6, materialMaps: MAPS_A }, { id: "b", surface: "dirt", triplanar: false, materialMaps: MAPS_B }]);
  const paint = createTerrainPaintTextures(paintWeights(editable));
  expect(paint.slots[0]?.tileMetres).toBe(6);
  expect(paint.slots[1]?.triplanar).toBe(false);
  const { material } = createTerrainDetailMaterial(detail, undefined, { paint, ...(surfaces === undefined ? {} : { surfaces }) });
  expect(material.defines?.["JG_TERRAIN_GEN"]).toBe("");
  const uniforms: Record<string, { value: unknown }> = {};
  const shader = { uniforms, vertexShader: "", fragmentShader: "#include <common>" };
  // type-escape: the fake shader stands in for three's program parameters, as in the tests above.
  material.onBeforeCompile?.(shader as never, undefined as never);
  const layerScan = uniforms["uLayerScan"]?.value;
  expect(layerScan instanceof Float32Array ? [...layerScan].slice(0, 3) : null).toEqual([-1, 1, 0]);
  expect(shader.fragmentShader).toContain("jgGenProject(scanLayer");
  surfaces?.dispose();
});

test("a scan that was never loaded is an error, not a grey ground", () => {
  const detail = resolveTerrainDetail({ surfaces: { ground: { scan: MAPS_A } } });
  expect(() => createTerrainSurfaceTextures(detail.surfaces)).toThrow(/was not loaded/);
});

test("the preset path compiles with no scan code and no array textures", () => {
  const editable = createEditableTerrain({ bounds: { minX: 0, minZ: 0, maxX: 8, maxZ: 8 }, cellSize: 2 });
  editable.setLayers([{ id: "a", surface: "grass" }]);
  const paint = createTerrainPaintTextures(paintWeights(editable));
  const { material } = createTerrainDetailMaterial(resolveTerrainDetail({}), undefined, { paint });
  expect(material.defines?.["JG_TERRAIN_GEN"]).toBeUndefined();
  expect(paint.slots[0]?.scan).toBeUndefined();
  expect(paint.slots[0]?.tileMetres).toBe(0);
});
