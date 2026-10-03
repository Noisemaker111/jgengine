import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeIO, type JSONDocument } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import type { EditorPrefab } from "@jgengine/core/editor/types";
import { prepareCollisionMesh } from "@jgengine/core/scene/collisionMesh";
import { bakeStaticPrefab, type StaticPrefabSource, type StaticPrefabTextureSource } from "./staticPrefabBake";

const scratch: string[] = [];
afterEach(() => { for (const directory of scratch.splice(0)) rmSync(directory, { recursive: true, force: true }); });
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const png = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS9sAAAAASUVORK5CYII=", "base64"));

function pack(json: JSONDocument["json"], bin: Uint8Array): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonSize = Math.ceil(text.length / 4) * 4;
  const bytes = new Uint8Array(28 + jsonSize + Math.ceil(bin.length / 4) * 4);
  const view = new DataView(bytes.buffer);
  for (const [offset, value] of [[0, 0x46546c67], [4, 2], [8, bytes.length], [12, jsonSize], [16, 0x4e4f534a], [20 + jsonSize, Math.ceil(bin.length / 4) * 4], [24 + jsonSize, 0x004e4942]]) view.setUint32(offset!, value!, true);
  bytes.fill(32, 20, 20 + jsonSize);
  bytes.set(text, 20);
  bytes.set(bin, 28 + jsonSize);
  return bytes;
}

function fixture(options: { embedded?: boolean; flat?: boolean; textureUrl?: string; mutate?: (json: JSONDocument["json"]) => void } = {}): { source: StaticPrefabSource; json: JSONDocument["json"] } {
  const directory = mkdtempSync(join(tmpdir(), "jg-static-prefab-"));
  scratch.push(directory);
  const position = new Float32Array([0, 0, 0, 2, 0, 0, 2, options.flat ? 0 : 1, 3, 0, options.flat ? 0 : 1, 3]);
  const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const geometryLength = position.byteLength + uv.byteLength + indices.byteLength;
  const binary = new Uint8Array(geometryLength + (options.embedded ? png.length : 0));
  binary.set(new Uint8Array(position.buffer));
  binary.set(new Uint8Array(uv.buffer), position.byteLength);
  binary.set(new Uint8Array(indices.buffer), position.byteLength + uv.byteLength);
  if (options.embedded) binary.set(png, geometryLength);
  const texturePath = join(directory, "palette.png");
  writeFileSync(texturePath, png);
  const texture: StaticPrefabTextureSource = { uri: "../shared/palette.png", path: texturePath, sha256: hash(png), bytes: png.length, url: options.textureUrl ?? "/games/fixture/art/shared/palette.png" };
  const json: JSONDocument["json"] = {
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, translation: [1, 2, 3] }],
    meshes: [{ primitives: [0, 1].map((material) => ({ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material })) }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: position.byteLength },
      { buffer: 0, byteOffset: position.byteLength, byteLength: uv.byteLength },
      { buffer: 0, byteOffset: position.byteLength + uv.byteLength, byteLength: indices.byteLength },
      ...(options.embedded ? [{ buffer: 0, byteOffset: geometryLength, byteLength: png.length }] : []),
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: "VEC3", min: [0, 0, 0], max: [2, options.flat ? 0 : 1, 3] },
      { bufferView: 1, componentType: 5126, count: 4, type: "VEC2" },
      { bufferView: 2, componentType: 5123, count: 6, type: "SCALAR" },
    ],
    materials: [
      { name: "custom brick", pbrMetallicRoughness: { baseColorFactor: [0.2, 0.4, 0.6, 1], metallicFactor: 0.25, roughnessFactor: 0.7, baseColorTexture: { index: 0 } }, doubleSided: true },
      { name: "custom copper", pbrMetallicRoughness: { baseColorFactor: [0.7, 0.3, 0.1, 1], metallicFactor: 0.9, roughnessFactor: 0.2, baseColorTexture: { index: 0 } } },
    ],
    textures: [{ source: 0, sampler: 0 }], samplers: [{ magFilter: 9728, minFilter: 9984, wrapS: 33071, wrapT: 33648 }],
    images: [options.embedded ? { bufferView: 3, mimeType: "image/png" } : { uri: texture.uri }],
  };
  options.mutate?.(json);
  const bytes = pack(json, binary);
  const path = join(directory, "source.glb");
  writeFileSync(path, bytes);
  return { source: { catalogId: "game:custom-wall", path, sha256: hash(bytes), bytes: bytes.length, ...(options.embedded ? {} : { textures: [texture] }) }, json };
}

function prefab(): EditorPrefab {
  return {
    id: "game:editable-house", name: "Custom house", staticBake: { assetId: "game:house" },
    fragment: { markers: [{ id: "wall", kind: "prop", catalogId: "game:custom-wall", position: { x: 10, y: 4, z: 20 }, rotationY: Math.PI / 2, meta: { verticalOffset: 0.5, artCredit: "Custom art" } }], volumes: [], paths: [], annotations: [] },
  };
}

function outputJson(bytes: Uint8Array): JSONDocument["json"] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true))));
}

describe("static editor prefab export", () => {
  test("preserves raw source transforms, local yaw/lift, materials, UVs, sampler and full shared texture URLs", async () => {
    const { source } = fixture();
    const authored = prefab();
    const before = JSON.stringify(authored);
    const original = readFileSync(source.path);
    const result = await bakeStaticPrefab(authored, [source]);
    const again = await bakeStaticPrefab(authored, [source]);
    expect(result.bytes).toEqual(again.bytes);
    expect(result.report).toEqual(again.report);
    expect(JSON.stringify(authored)).toBe(before);
    expect(readFileSync(source.path)).toEqual(original);
    expect(result.anchor).toBe("origin");
    expect(result.space).toEqual({ anchor: { x: 0, z: 0 }, unitScale: 1 });
    expect(result.dims.footprint.w).toBeCloseTo(3);
    expect(result.dims.footprint.d).toBeCloseTo(2);
    expect(result.dims.center.x).toBeCloseTo(14.5);
    expect(result.dims.center.z).toBeCloseTo(18);
    expect(result.dims.minY).toBeCloseTo(6.5);
    expect(result.dims.maxY).toBeCloseTo(7.5);
    expect(result.report.bounds.min).toEqual([13, 6.5, 17]);
    expect(result.report.bounds.max).toEqual([16, 7.5, 19]);
    expect(result.report.triangles).toBe(4);
    expect(result.report.submissions).toBe(2);
    expect(result.report.sha256).toBe(hash(result.bytes));
    expect(result.report.byteLength).toBe(result.bytes.length + png.length);
    expect(result.report.sourcePrefabSha256).toBe(hash(new TextEncoder().encode(JSON.stringify(authored.fragment))));
    const texture = source.textures![0]!;
    const provenance = { uri: texture.uri, url: texture.url, bytes: texture.bytes, sha256: texture.sha256 };
    expect(result.report.sources).toEqual([{ catalogId: source.catalogId, sha256: source.sha256, bytes: source.bytes, textures: [provenance] }]);
    expect(result.report.textures).toEqual([provenance]);
    expect(JSON.stringify(result.report)).not.toContain(source.path);
    expect(result.collisionMesh.boxes).toEqual([result.report.bounds]);
    const collision = prepareCollisionMesh(result.collisionMesh);
    expect(collision.positions.length).toBe(12);
    expect(collision.indices.length).toBe(12);
    const json = outputJson(result.bytes);
    expect(json.images).toEqual([{ uri: source.textures![0]!.url, mimeType: "image/png" }]);
    expect(json.materials?.map((material) => material.pbrMetallicRoughness)).toEqual([
      { baseColorFactor: [0.2, 0.4, 0.6, 1], roughnessFactor: 0.7, metallicFactor: 0.25, baseColorTexture: { index: 0 } },
      { baseColorFactor: [0.7, 0.3, 0.1, 1], roughnessFactor: 0.2, metallicFactor: 0.9, baseColorTexture: { index: 0 } },
    ]);
    expect(json.samplers).toEqual([{ magFilter: 9728, minFilter: 9984, wrapS: 33071, wrapT: 33648 }]);
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    const resources = { "@glb.bin": result.bytes.subarray(28 + new DataView(result.bytes.buffer).getUint32(12, true)), [source.textures![0]!.url]: png };
    const decoded = await io.readJSON({ json, resources });
    const uv = decoded.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getAttribute("TEXCOORD_0")!;
    const uvValues = Array.from({ length: uv.getCount() }, (_, i) => uv.getElement(i, []));
    expect(uvValues).toEqual([[0, 0], [1, 0], [1, 1], [0, 1]]);
  });

  test("combines repeated static parts into material groups without losing their triangles", async () => {
    const { source } = fixture();
    const authored = prefab();
    authored.fragment.markers = [...authored.fragment.markers, { ...authored.fragment.markers[0]!, id: "second", position: { x: -8, y: -2, z: -12 }, rotationY: 0 }];
    const result = await bakeStaticPrefab(authored, [source]);
    expect(result.report.submissions).toBe(2);
    expect(result.report.triangles).toBe(8);
    expect(result.report.sources).toHaveLength(1);
    expect(result.report.textures).toHaveLength(1);
    expect(result.collisionMesh.triangleCount).toBe(8);
    for (const [axis, value] of [-7, 0.5, -9].entries()) expect(result.report.bounds.min[axis]).toBeCloseTo(value);
    for (const [axis, value] of [16, 7.5, 19].entries()) expect(result.report.bounds.max[axis]).toBeCloseTo(value);
  });

  test("keeps distinct same-basename texture ownership and URLs", async () => {
    const first = fixture({ textureUrl: "/custom/brick/palette.png" }).source;
    const second = { ...fixture({ textureUrl: "/custom/copper/palette.png" }).source, catalogId: "game:second-wall" };
    const authored = prefab();
    authored.fragment.markers = [...authored.fragment.markers, { ...authored.fragment.markers[0]!, id: "second", catalogId: second.catalogId }];
    const result = await bakeStaticPrefab(authored, [first, second]);
    expect(outputJson(result.bytes).images?.map((image) => image.uri).sort()).toEqual(["/custom/brick/palette.png", "/custom/copper/palette.png"]);
    expect(result.report.textures).toHaveLength(2);
    expect(result.report.byteLength).toBe(result.bytes.length + png.length * 2);
  });

  test("retains embedded images as GLB buffer views", async () => {
    const { source } = fixture({ embedded: true });
    const result = await bakeStaticPrefab(prefab(), [source]);
    expect(result.report.textures).toEqual([]);
    expect(result.report.byteLength).toBe(result.bytes.length);
    const json = outputJson(result.bytes);
    expect(json.images![0]!.uri).toBeUndefined();
    expect(json.images![0]!.bufferView).toBeDefined();
    const document = await new NodeIO().readBinary(result.bytes);
    expect(document.getRoot().listTextures()[0]!.getImage()).toEqual(png);
  });

  test("authored movement solids and clearance openings round-trip without broad bounds obstruction", async () => {
    const { source } = fixture();
    const authored = prefab();
    authored.staticBake = { assetId: "game:house", collisionBoxes: [{ min: [13, 6.5, 17], max: [14, 7.5, 19] }, { min: [15, 6.5, 17], max: [16, 7.5, 19] }], clearances: [{ id: "door", min: [14, 6.5, 17], max: [15, 7.5, 19] }] };
    const result = await bakeStaticPrefab(authored, [source]);
    expect(result.collisionMesh.boxes).toEqual(authored.staticBake.collisionBoxes!);
    expect(result.collisionMesh.triangleCount).toBe(4);
    authored.staticBake.clearances = [{ id: "blocked door", min: [13.5, 6.5, 17], max: [15, 7.5, 19] }];
    await expect(bakeStaticPrefab(authored, [source])).rejects.toThrow("clearance blocked door intersects a collision box");
    delete authored.staticBake.collisionBoxes;
    await expect(bakeStaticPrefab(authored, [source])).rejects.toThrow("clearances require explicit collisionBoxes");
  });

  test("source and texture pins fail before emitting bytes", async () => {
    const { source } = fixture();
    await expect(bakeStaticPrefab(prefab(), [{ ...source, sha256: "a".repeat(64) }])).rejects.toThrow("Provision or verify");
    await expect(bakeStaticPrefab(prefab(), [{ ...source, textures: [] }])).rejects.toThrow("unpinned external texture");
    await expect(bakeStaticPrefab(prefab(), [{ ...source, textures: [{ ...source.textures![0]!, bytes: 1 }] }])).rejects.toThrow("Provision or verify");
    await expect(bakeStaticPrefab(prefab(), [])).rejects.toThrow("no pinned source");
    await expect(bakeStaticPrefab(prefab(), [source, source])).rejects.toThrow("Duplicate static prefab source");
  });

  test("provenance is portable across source directories and includes only verified images", async () => {
    const first = fixture().source;
    const moved = fixture().source;
    const ignored = { uri: "unused.png", url: "/custom/unused.png", path: join(tmpdir(), "missing-unused-image.png"), bytes: 99, sha256: "x".repeat(64) };
    const authored = prefab();
    const original = await bakeStaticPrefab(authored, [first]);
    const relocated = await bakeStaticPrefab(authored, [{ ...moved, textures: [...moved.textures!, ignored] }]);
    expect(relocated.bytes).toEqual(original.bytes);
    expect(relocated.report).toEqual(original.report);
    expect(JSON.stringify(relocated.report)).not.toContain("unused");
    authored.staticBake!.assetId = "game:alternate-asset";
    const retargeted = await bakeStaticPrefab(authored, [first]);
    expect(retargeted.report.staticBakeSha256).not.toBe(original.report.staticBakeSha256);
    expect(retargeted.report.sourcePrefabSha256).toBe(original.report.sourcePrefabSha256);
  });

  test("captures authored data and source pins before asynchronous reads", async () => {
    const { source } = fixture();
    const authored = prefab();
    authored.fragment.markers[0]!.meta!.credit = { artist: "Original artist" };
    const reference = await bakeStaticPrefab(authored, [source]);
    const pending = bakeStaticPrefab(authored, [source]);
    const marker = authored.fragment.markers[0]!;
    marker.position.x = -100;
    marker.id = "edited while exporting";
    (marker.meta!.credit as { artist: string }).artist = "Edited artist";
    authored.staticBake!.assetId = "game:edited-output";
    authored.staticBake!.collisionBoxes = [{ min: [-200, -200, -200], max: [-100, -100, -100] }];
    source.path = join(tmpdir(), "changed-source.glb");
    source.sha256 = "b".repeat(64);
    source.bytes = 1;
    const texture = source.textures![0]!;
    texture.uri = "changed.png";
    texture.path = join(tmpdir(), "changed-image.png");
    texture.url = "/edited/art.png";
    texture.sha256 = "c".repeat(64);
    texture.bytes = 1;
    expect(await pending).toEqual(reference);
    expect(marker.position.x).toBe(-100);
    expect(marker.id).toBe("edited while exporting");
    expect(marker.meta!.credit).toEqual({ artist: "Edited artist" });
    expect(authored.staticBake!.assetId).toBe("game:edited-output");
    expect(source.bytes).toBe(1);
    expect(texture.url).toBe("/edited/art.png");
  });

  test("degenerate inferred movement bounds require authored solid boxes", async () => {
    const { source } = fixture({ flat: true });
    const authored = prefab();
    authored.fragment.markers[0]!.rotationY = 0;
    await expect(bakeStaticPrefab(authored, [source])).rejects.toThrow("degenerate bounds");
    authored.staticBake!.collisionBoxes = [{ min: [10, 6, 20], max: [12, 7, 24] }];
    expect((await bakeStaticPrefab(authored, [source])).collisionMesh.boxes).toEqual(authored.staticBake!.collisionBoxes);
  });

  test.each([
    ["animations", (json: JSONDocument["json"]) => { json.animations = [{ channels: [], samplers: [] }]; }],
    ["skins", (json: JSONDocument["json"]) => { json.skins = [{ joints: [0] }]; }],
    ["morph targets", (json: JSONDocument["json"]) => { json.meshes![0]!.primitives[0]!.targets = [{ POSITION: 0 }]; }],
    ["exactly one scene", (json: JSONDocument["json"]) => { json.scenes!.push({ nodes: [] }); }],
    ["unskinned triangle primitives", (json: JSONDocument["json"]) => { json.meshes![0]!.primitives[0]!.mode = 1; }],
    ["unsupported static prefab extension", (json: JSONDocument["json"]) => { json.extensionsUsed = ["KHR_lights_punctual"]; }],
    ["zero-scale", (json: JSONDocument["json"]) => { json.nodes![0]!.scale = [1, 0, 1]; }],
    ["sheared", (json: JSONDocument["json"]) => { json.nodes![0]!.matrix = [1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }],
  ])("rejects unsupported source %s", async (message, mutate) => {
    const { source } = fixture({ mutate });
    await expect(bakeStaticPrefab(prefab(), [source])).rejects.toThrow(message);
  });

  test("rejects interactive content and unsupported authored transforms", async () => {
    const { source } = fixture();
    for (const kind of ["mob", "chest", "npc", "travel", "custom-interactive-marker"]) {
      const authored = prefab();
      authored.fragment.markers[0]!.kind = kind;
      await expect(bakeStaticPrefab(authored, [source])).rejects.toThrow("requires kind prop");
    }
    for (const key of ["scale", "rotationX", "animation", "interactive", "on", "action", "triggers", "triggerRadius", "maps", "materialId", "offsetY"]) {
      const authored = prefab();
      authored.fragment.markers[0]!.meta![key] = 1;
      await expect(bakeStaticPrefab(authored, [source])).rejects.toThrow(`unsupported ${key}`);
    }
    const authored = prefab();
    authored.fragment.paths = [{ id: "walk", kind: "road", points: [] }];
    await expect(bakeStaticPrefab(authored, [source])).rejects.toThrow("model markers only");
  });
});
