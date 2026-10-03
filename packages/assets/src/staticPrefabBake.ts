import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { Document, GLB_BUFFER, NodeIO, PropertyType, Root, type GLTF, type JSONDocument, type Node, type Texture } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, flatten, getBounds, join, mergeDocuments, unpartition, weld } from "@gltf-transform/functions";
import type { EditorMarker, EditorPrefab } from "@jgengine/core/editor/types";
import { parseStaticPrefabBake, type StaticPrefabBox } from "@jgengine/core/editor/staticPrefab";
import type { ModelAssetRef, ModelDims } from "@jgengine/core/scene/assetCatalog";
import { encodeCollisionMesh, type CollisionMeshData } from "@jgengine/core/scene/collisionMesh";
import { markerCatalogId } from "@jgengine/core/world/authoredObjects";
import { readGlbMetrics } from "./glbMetrics";

/** A verified external source image and its complete runtime URL. URI matches the source GLB exactly. */
export interface StaticPrefabTextureSource {
  uri: string;
  path: string;
  sha256: string;
  bytes: number;
  url: string;
}

/** Original static model bytes; paths are absolute and every external image must have a pin. */
export interface StaticPrefabSource {
  catalogId: string;
  path: string;
  sha256: string;
  bytes: number;
  textures?: readonly StaticPrefabTextureSource[];
}

/** Deterministic inventory and provenance for an editor-authored static artifact. */
export interface StaticPrefabBakeReport {
  assetId: string;
  prefabId: string;
  sha256: string;
  bytes: number;
  /** GLB and unique external images; shared textures still contribute real encoded bytes. */
  byteLength: number;
  triangles: number;
  submissions: number;
  /** Optimization merges source mesh primitives; original mesh/primitive selectors are not portable. */
  materialLayout: "merged-by-source-material";
  bounds: StaticPrefabBox;
  sourcePrefabSha256: string;
  staticBakeSha256: string;
  sources: readonly { catalogId: string; sha256: string; bytes: number; copyright?: string; textures?: readonly Omit<StaticPrefabTextureSource, "path">[] }[];
  textures: readonly Omit<StaticPrefabTextureSource, "path">[];
}

/** GLB bytes and catalog-ready metadata; origin anchoring preserves the editable fragment's local frame. */
export interface StaticPrefabBakeResult {
  bytes: Uint8Array;
  dims: ModelDims;
  space: NonNullable<ModelAssetRef["space"]>;
  anchor: "origin";
  collisionMesh: CollisionMeshData;
  report: StaticPrefabBakeReport;
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readPin(pin: { path: string; sha256: string; bytes: number }): Promise<Uint8Array> {
  if (!isAbsolute(pin.path)) throw new Error(`Static prefab source path must be absolute: ${pin.path}`);
  if (!Number.isSafeInteger(pin.bytes) || pin.bytes <= 0 || !/^[a-f0-9]{64}$/.test(pin.sha256))
    throw new Error(`Invalid byte/hash pin for ${pin.path}`);
  let bytes: Uint8Array;
  try {
    bytes = await readFile(pin.path);
  } catch (cause) {
    throw new Error(`Provision or restore pinned static prefab source ${pin.path}`, { cause });
  }
  if (bytes.length !== pin.bytes || sha256(bytes) !== pin.sha256)
    throw new Error(`Provision or verify ${pin.path}: static prefab source does not match its byte/hash pin`);
  return bytes;
}

function markerTransform(marker: EditorMarker): { catalogId: string; translation: [number, number, number]; yaw: number } {
  if (marker.kind !== "prop") throw new Error(`Static prefab marker ${marker.id} requires kind prop; interactive or custom kind ${marker.kind} is unsupported`);
  const catalogId = markerCatalogId(marker);
  if (catalogId === null) throw new Error(`Static prefab marker ${marker.id} requires a pinned catalogId`);
  const unsupported = ["scale", "scaleX", "scaleY", "scaleZ", "rotation", "rotationX", "rotationZ", "quaternion", "matrix", "offsetY", "yOffset", "targetHeight", "anchor", "animation", "interactive", "interaction", "behavior", "on", "action", "triggers", "triggerRadius", "generatorId", "params", "material", "materialId", "materials", "materialAssignments", "surface", "maps", "tint"];
  for (const key of unsupported) {
    if (marker.meta?.[key] !== undefined || (marker as unknown as Record<string, unknown>)[key] !== undefined)
      throw new Error(`Static prefab marker ${marker.id}: unsupported ${key}; keep this part outside the static bake`);
  }
  const lift = marker.meta?.verticalOffset ?? 0;
  const yaw = marker.rotationY ?? 0;
  const translation: [number, number, number] = [marker.position.x, marker.position.y, marker.position.z];
  if (!translation.every(Number.isFinite) || typeof lift !== "number" || !Number.isFinite(lift) || !Number.isFinite(yaw))
    throw new Error(`Static prefab marker ${marker.id} requires finite position, verticalOffset, and rotationY`);
  translation[1] += lift;
  if (!Number.isFinite(translation[1])) throw new Error(`Static prefab marker ${marker.id} has an overflowing verticalOffset`);
  return { catalogId, translation, yaw };
}

function decodeGlb(bytes: Uint8Array): JSONDocument {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length)
    throw new Error("Static prefab sources must be valid GLB v2 files");
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || jsonLength % 4 !== 0 || 20 + jsonLength > bytes.length)
    throw new Error("Invalid static prefab GLB JSON chunk");
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as GLTF.IGLTF;
  const offset = 20 + jsonLength;
  const resources: Record<string, Uint8Array> = {};
  if (offset < bytes.length) {
    if (offset + 8 > bytes.length || view.getUint32(offset + 4, true) !== 0x004e4942 || view.getUint32(offset, true) % 4 !== 0 || offset + 8 + view.getUint32(offset, true) !== bytes.length)
      throw new Error("Invalid static prefab GLB BIN chunk");
    resources[GLB_BUFFER] = bytes.subarray(offset + 8);
  }
  return { json, resources };
}

function validateStaticSource(json: GLTF.IGLTF, path: string): void {
  if ((json.animations?.length ?? 0) > 0 || (json.skins?.length ?? 0) > 0 || json.nodes?.some((node) => node.skin !== undefined))
    throw new Error(`${path}: animations and skins cannot be baked into a static prefab`);
  if (json.nodes?.some((node) => node.weights !== undefined) || json.meshes?.some((mesh) => mesh.weights !== undefined || mesh.primitives.some((primitive) => (primitive.targets?.length ?? 0) > 0)))
    throw new Error(`${path}: morph targets cannot be baked into a static prefab`);
  if (json.scenes?.length !== 1 || (json.cameras?.length ?? 0) > 0)
    throw new Error(`${path}: static prefab sources require exactly one scene and no cameras`);
  const supported = new Set(ALL_EXTENSIONS.map((extension) => extension.EXTENSION_NAME));
  for (const extension of new Set([...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])])) {
    if (!supported.has(extension) || !/^(KHR_materials_|KHR_texture_transform$|KHR_texture_basisu$|EXT_texture_webp$|EXT_texture_avif$)/.test(extension))
      throw new Error(`${path}: unsupported static prefab extension ${extension}`);
  }
  for (const node of json.nodes ?? []) {
    for (const vector of [node.matrix, node.translation, node.rotation, node.scale]) {
      if (vector !== undefined && !vector.every(Number.isFinite)) throw new Error(`${path}: non-finite source transform`);
    }
    if (node.scale?.some((value) => value === 0)) throw new Error(`${path}: zero-scale source transform`);
    if (node.matrix !== undefined) {
      const m = node.matrix;
      const columns = [[m[0]!, m[1]!, m[2]!], [m[4]!, m[5]!, m[6]!], [m[8]!, m[9]!, m[10]!]];
      if (m[3] !== 0 || m[7] !== 0 || m[11] !== 0 || m[15] !== 1 || columns.some((column) => Math.hypot(...column) === 0) || columns.some((a, i) => columns.some((b, j) => i < j && Math.abs(a.reduce((sum, value, k) => sum + value * b[k]!, 0)) > 1e-6 * Math.hypot(...a) * Math.hypot(...b))))
        throw new Error(`${path}: sheared or non-affine source transform`);
    }
  }
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      if ((primitive.mode ?? 4) !== 4 || primitive.attributes.POSITION === undefined || Object.keys(primitive.attributes).some((name) => /^(JOINTS|WEIGHTS)_/.test(name)))
        throw new Error(`${path}: static prefabs require unskinned triangle primitives with POSITION`);
    }
  }
}

function encodeGlb(output: JSONDocument, document: Document): Uint8Array {
  const json = output.json;
  const buffer = json.buffers?.[0];
  if (json.buffers?.length !== 1 || buffer?.uri === undefined) throw new Error("Static prefab output requires one binary buffer");
  let binary = output.resources[buffer.uri];
  if (binary === undefined) throw new Error("Static prefab output buffer is missing");
  const textures = document.getRoot().listTextures();
  for (let i = 0; i < (json.images?.length ?? 0); i += 1) {
    const image = json.images![i]!;
    const runtimeUrl = textures[i]!.getURI();
    if (runtimeUrl !== "") {
      // GLTFTransform's GLTF writer strips image directories; the pinned runtime URI is authoritative.
      image.uri = runtimeUrl;
    } else {
      const encoded = image.uri === undefined ? undefined : output.resources[image.uri];
      if (encoded === undefined) throw new Error("Static prefab embedded image is missing");
      const offset = Math.ceil(binary.length / 4) * 4;
      const combined = new Uint8Array(offset + encoded.length);
      combined.set(binary);
      combined.set(encoded, offset);
      binary = combined;
      image.bufferView = (json.bufferViews ??= []).length;
      json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: encoded.length });
      delete image.uri;
    }
  }
  buffer.byteLength = binary.length;
  delete buffer.uri;
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonSize = Math.ceil(text.length / 4) * 4;
  const binSize = Math.ceil(binary.length / 4) * 4;
  const bytes = new Uint8Array(28 + jsonSize + binSize);
  const view = new DataView(bytes.buffer);
  for (const [offset, value] of [[0, 0x46546c67], [4, 2], [8, bytes.length], [12, jsonSize], [16, 0x4e4f534a], [20 + jsonSize, binSize], [24 + jsonSize, 0x004e4942]])
    view.setUint32(offset!, value!, true);
  bytes.fill(32, 20, 20 + jsonSize);
  bytes.set(text, 20);
  bytes.set(binary, 28 + jsonSize);
  return bytes;
}

function dedupPinnedTextures(document: Document): void {
  const owners = new Map<string, Texture>();
  for (const texture of document.getRoot().listTextures()) {
    const image = texture.getImage();
    if (image === null) throw new Error("Static prefab texture has no verified image bytes");
    // Generic dedup ignores URIs, which merges separately owned but byte-identical source images.
    const key = JSON.stringify([texture.getURI(), texture.getMimeType(), sha256(image), texture.getName(), texture.getExtras()]);
    const existing = owners.get(key);
    if (existing === undefined) {
      owners.set(key, texture);
    } else {
      for (const parent of texture.listParents()) if (!(parent instanceof Root)) parent.swap(texture, existing);
      texture.dispose();
    }
  }
}

function textureProvenance(pin: StaticPrefabTextureSource): Omit<StaticPrefabTextureSource, "path"> {
  return { uri: pin.uri, url: pin.url, sha256: pin.sha256, bytes: pin.bytes };
}

/**
 * Bake pinned static source art in an editor prefab's local frame. Node-only; never mutates authored data.
 * @capability static-prefab-export export editable prefab compositions with source materials and collision metadata
 */
export async function bakeStaticPrefab(prefab: EditorPrefab, sources: readonly StaticPrefabSource[]): Promise<StaticPrefabBakeResult> {
  return bakeStaticPrefabSnapshot(structuredClone(prefab), structuredClone(sources));
}

async function bakeStaticPrefabSnapshot(prefab: EditorPrefab, sources: readonly StaticPrefabSource[]): Promise<StaticPrefabBakeResult> {
  if (prefab.staticBake === undefined) throw new Error(`Prefab ${prefab.id} has no authored staticBake settings`);
  const config = parseStaticPrefabBake(prefab.staticBake);
  const fragment = prefab.fragment;
  if (fragment.markers.length === 0 || fragment.volumes.length > 0 || fragment.paths.length > 0 || fragment.annotations.length > 0)
    throw new Error(`Static prefab ${prefab.id} requires model markers only; retain gameplay regions, paths, and notes outside the bake`);
  const ids = new Set<string>();
  const parts = fragment.markers.map((marker) => {
    if (ids.has(marker.id)) throw new Error(`Static prefab ${prefab.id} has duplicate marker id ${marker.id}`);
    ids.add(marker.id);
    return markerTransform(marker);
  });
  const byId = new Map<string, StaticPrefabSource>();
  for (const source of sources) {
    if (byId.has(source.catalogId)) throw new Error(`Duplicate static prefab source ${source.catalogId}`);
    byId.set(source.catalogId, source);
  }
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const document = new Document();
  const scene = document.createScene(prefab.name);
  document.getRoot().setDefaultScene(scene);
  const loaded = new Map<string, Document>();
  const usedSources: StaticPrefabBakeReport["sources"][number][] = [];
  const usedTextures = new Map<string, { pin: StaticPrefabTextureSource; data: Uint8Array }>();
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]!;
    let sourceDocument = loaded.get(part.catalogId);
    if (sourceDocument === undefined) {
      const source = byId.get(part.catalogId);
      if (source === undefined) throw new Error(`Static prefab marker ${fragment.markers[i]!.id}: no pinned source for ${part.catalogId}`);
      const bytes = await readPin(source);
      const input = decodeGlb(bytes);
      validateStaticSource(input.json, source.path);
      const textures = new Map<string, StaticPrefabTextureSource>();
      const verifiedTextures = new Map<string, StaticPrefabTextureSource>();
      for (const texture of source.textures ?? []) {
        if (textures.has(texture.uri)) throw new Error(`${source.path}: duplicate texture pin URI ${texture.uri}`);
        if (!texture.url.startsWith("/") && !/^https?:\/\//.test(texture.url)) throw new Error(`${source.path}: texture requires a full runtime URL: ${texture.url}`);
        textures.set(texture.uri, texture);
      }
      for (const image of input.json.images ?? []) {
        if (image.uri === undefined || image.uri.startsWith("data:")) continue;
        const pin = textures.get(image.uri);
        if (pin === undefined) throw new Error(`${source.path}: unpinned external texture ${image.uri}`);
        const previous = usedTextures.get(pin.url);
        if (previous !== undefined && (previous.pin.sha256 !== pin.sha256 || previous.pin.bytes !== pin.bytes)) throw new Error(`Conflicting static prefab texture pins for ${pin.url}`);
        const data = await readPin(pin);
        input.resources[image.uri] = data;
        verifiedTextures.set(image.uri, pin);
        usedTextures.set(pin.url, { pin: { ...pin }, data });
      }
      readGlbMetrics(bytes, (uri) => {
        const resource = input.resources[uri];
        if (resource === undefined) throw new Error(`${source.path}: unpinned external resource ${uri}`);
        return resource;
      });
      sourceDocument = await io.readJSON(input);
      for (const texture of sourceDocument.getRoot().listTextures()) {
        const pin = textures.get(texture.getURI());
        if (pin !== undefined) texture.setURI(pin.url);
      }
      loaded.set(part.catalogId, sourceDocument);
      usedSources.push({ catalogId: source.catalogId, sha256: source.sha256, bytes: source.bytes, ...(input.json.asset.copyright === undefined ? {} : { copyright: input.json.asset.copyright }), ...(verifiedTextures.size === 0 ? {} : { textures: [...verifiedTextures.values()].map(textureProvenance) }) });
    }
    const mapping = mergeDocuments(document, sourceDocument);
    const pivot = document.createNode(fragment.markers[i]!.id).setTranslation(part.translation).setRotation([0, Math.sin(part.yaw / 2), 0, Math.cos(part.yaw / 2)]);
    for (const sourceScene of sourceDocument.getRoot().listScenes()) {
      for (const node of sourceScene.listChildren()) pivot.addChild(mapping.get(node)! as Node);
      mapping.get(sourceScene)!.dispose();
    }
    scene.addChild(pivot);
  }
  dedupPinnedTextures(document);
  await document.transform(dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.MATERIAL], keepUniqueNames: true }), flatten(), join({ keepNamed: false }), weld(), unpartition());
  const positions: number[] = [];
  const indices: number[] = [];
  let submissions = 0;
  scene.traverse((node) => {
    const matrix = node.getWorldMatrix();
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      const position = primitive.getAttribute("POSITION")!;
      const base = positions.length / 3;
      const vertex = [0, 0, 0];
      for (let i = 0; i < position.getCount(); i += 1) {
        position.getElement(i, vertex);
        for (let axis = 0; axis < 3; axis += 1)
          positions.push(matrix[axis]! * vertex[0]! + matrix[axis + 4]! * vertex[1]! + matrix[axis + 8]! * vertex[2]! + matrix[axis + 12]!);
      }
      const sourceIndices = primitive.getIndices();
      for (let i = 0; i < (sourceIndices?.getCount() ?? position.getCount()); i += 1) indices.push(base + (sourceIndices?.getScalar(i) ?? i));
      submissions += 1;
    }
  });
  const collisionMesh = encodeCollisionMesh({ positions, indices });
  if (collisionMesh === null) throw new Error(`Static prefab ${prefab.id} has no nondegenerate collision triangles`);
  const bounds = getBounds(scene);
  if (![...bounds.min, ...bounds.max].every(Number.isFinite)) throw new Error(`Static prefab ${prefab.id} has invalid bounds`);
  if (config.collisionBoxes === undefined && bounds.min.some((value, axis) => value >= bounds.max[axis]!))
    throw new Error(`Static prefab ${prefab.id} has degenerate bounds; author explicit collisionBoxes`);
  collisionMesh.boxes = config.collisionBoxes ?? [{ min: [...bounds.min], max: [...bounds.max] }];
  const dims: ModelDims = {
    footprint: { w: bounds.max[0] - bounds.min[0], d: bounds.max[2] - bounds.min[2] },
    center: { x: (bounds.max[0] + bounds.min[0]) / 2, z: (bounds.max[2] + bounds.min[2]) / 2 },
    minY: bounds.min[1], maxY: bounds.max[1],
  };
  const output = await io.writeJSON(document);
  const copyrights = [...new Set(usedSources.flatMap((source) => source.copyright === undefined ? [] : [source.copyright]))];
  if (copyrights.length > 0) output.json.asset.copyright = copyrights.join("\n");
  const bytes = encodeGlb(output, document);
  const metrics = readGlbMetrics(bytes, (url) => {
    const texture = usedTextures.get(url);
    if (texture === undefined) throw new Error(`Static prefab output has an unverified texture ${url}`);
    return texture.data;
  });
  return {
    bytes, dims, space: { anchor: { x: 0, z: 0 }, unitScale: 1 }, anchor: "origin", collisionMesh,
    report: {
      assetId: config.assetId, prefabId: prefab.id, sha256: sha256(bytes), bytes: bytes.length, byteLength: metrics.byteLength,
      triangles: metrics.triangles, submissions, materialLayout: "merged-by-source-material", bounds: { min: [...bounds.min], max: [...bounds.max] },
      sourcePrefabSha256: sha256(JSON.stringify(fragment)), staticBakeSha256: sha256(JSON.stringify(config)),
      sources: usedSources, textures: [...usedTextures.values()].map(({ pin }) => textureProvenance(pin)),
    },
  };
}
