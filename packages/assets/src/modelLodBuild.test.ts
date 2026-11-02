import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

import { parseBuiltLodMeta } from "@jgengine/core/lod/builtLods";

import { buildModelLods, describeLodBuild, SOURCE_MATERIAL_KEY } from "./modelLodBuild";

const directory = mkdtempSync(join(tmpdir(), "jg-model-lods-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

/** A smooth sphere of `rings`×`segments` quads with one material, standing on y = 0. */
async function sphereGlb(name: string, rings: number, segments: number): Promise<string> {
  const document = new Document();
  const buffer = document.createBuffer();
  const positions: number[] = [];
  const normals: number[] = [];
  for (let ring = 0; ring <= rings; ring += 1) {
    const phi = (ring / rings) * Math.PI;
    for (let segment = 0; segment <= segments; segment += 1) {
      const theta = (segment / segments) * Math.PI * 2;
      const x = Math.sin(phi) * Math.cos(theta);
      const y = Math.cos(phi);
      const z = Math.sin(phi) * Math.sin(theta);
      positions.push(x, y + 1, z);
      normals.push(x, y, z);
    }
  }
  const indices: number[] = [];
  for (let ring = 0; ring < rings; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const a = ring * (segments + 1) + segment;
      const b = a + segments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const primitive = document.createPrimitive()
    .setAttribute("POSITION", document.createAccessor().setType("VEC3").setArray(new Float32Array(positions)).setBuffer(buffer))
    .setAttribute("NORMAL", document.createAccessor().setType("VEC3").setArray(new Float32Array(normals)).setBuffer(buffer))
    .setIndices(document.createAccessor().setType("SCALAR").setArray(new Uint32Array(indices)).setBuffer(buffer))
    .setMaterial(document.createMaterial("bark").setBaseColorFactor([0.4, 0.3, 0.2, 1]));
  const mesh = document.createMesh("ball").addPrimitive(primitive);
  document.createScene("scene").addChild(document.createNode("ball").setMesh(mesh));
  const file = join(directory, name);
  writeFileSync(file, await new NodeIO().writeBinary(document));
  return file;
}

const PLAN = { levels: [{ ratio: 0.4, error: 0.05 }, { ratio: 0.1, error: 0.2 }] };

test("a model gets each level smaller than the one before, its bounds and its material index", async () => {
  const file = await sphereGlb("ball.glb", 48, 96);
  const result = await buildModelLods(file, PLAN);
  expect(result.status).toBe("built");
  const meta = parseBuiltLodMeta(JSON.parse(readFileSync(`${file}.lods/meta.json`, "utf8")));
  if (meta === null) throw new Error("expected a readable meta");
  expect(meta.triangles).toBe(48 * 96 * 2);
  expect(meta.levels.map((level) => level.file)).toEqual(["lod1.glb", "lod2.glb"]);
  expect(meta.levels[0]?.triangles ?? Infinity).toBeLessThan(meta.triangles * 0.5);
  expect(meta.levels[1]?.triangles ?? Infinity).toBeLessThan(meta.levels[0]?.triangles ?? 0);
  expect(meta.bounds.min[1]).toBeCloseTo(0, 5);
  expect(meta.bounds.max[1]).toBeCloseTo(2, 5);

  await MeshoptDecoder.ready;
  const level = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder }).read(`${file}.lods/lod1.glb`);
  const [material] = level.getRoot().listMaterials();
  expect(material?.getName()).toBe("bark");
  expect(material?.getExtras()[SOURCE_MATERIAL_KEY]).toBe(0);
  expect(level.getRoot().listTextures()).toHaveLength(0);
  expect(describeLodBuild(result)).toContain("ball.glb: 9,216 →");
});

test("a second build with the same source and plan writes nothing; a new plan rebuilds", async () => {
  const file = await sphereGlb("again.glb", 32, 64);
  expect((await buildModelLods(file, PLAN)).status).toBe("built");
  expect((await buildModelLods(file, PLAN)).status).toBe("cached");
  expect((await buildModelLods(file, { levels: [{ ratio: 0.5 }] })).status).toBe("built");
  expect(existsSync(`${file}.lods/lod2.glb`)).toBe(false);
});

test("a model below the triangle floor keeps no levels but still records that it was looked at", async () => {
  const file = await sphereGlb("pebble.glb", 6, 12);
  const result = await buildModelLods(file, PLAN);
  expect(result.status).toBe("built");
  expect(result.meta?.levels).toEqual([]);
});

test("a baker's atlas is written beside the levels and named in the meta", async () => {
  const file = await sphereGlb("tree.glb", 32, 64);
  const size = 4;
  const pixels = new Uint8Array(size * size * 4).fill(200);
  const result = await buildModelLods(file, PLAN, {
    impostor: { frames: 2, cell: 2 },
    bake: async () => ({ size, albedo: pixels, normal: pixels, center: [0, 1, 0], radius: 1.04 }),
  });
  expect(result.meta?.impostor).toEqual({ albedo: "impostor-albedo.png", normal: "impostor-normal.png", frames: 2, cell: 2, center: [0, 1, 0], radius: 1.04 });
  expect(existsSync(`${file}.lods/impostor-albedo.png`)).toBe(true);
});
