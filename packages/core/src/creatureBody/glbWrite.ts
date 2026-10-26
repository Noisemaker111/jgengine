/**
 * A small glTF 2.0 binary writer for generated models: meshes of indexed triangles with smooth
 * normals, a node tree, flat-colour materials and node animations (rotation and translation
 * keyframes). Enough for a procedural body that the engine's normal model pipeline loads, measures
 * and animates like any imported GLB.
 */

/** One triangle mesh part in its node's local space, drawn with one material. */
export interface GlbPrimitive {
  positions: number[];
  normals: number[];
  indices: number[];
  material: number;
}

/** A node of the model tree: its parent, rest transform and optional mesh parts. */
export interface GlbNode {
  name: string;
  /** Index of the parent node; -1 for a root. Parents come before children. */
  parent: number;
  translation: readonly [number, number, number];
  rotation?: readonly [number, number, number, number];
  primitives: GlbPrimitive[];
}

/** A flat-shaded material: base colour (sRGB hex), roughness and optional emissive glow. */
export interface GlbMaterial {
  name: string;
  color: string;
  roughness?: number;
  emissive?: string;
}

/** One animated property of one node: keyframe times in seconds and a value per key. */
export interface GlbTrack {
  node: number;
  path: "rotation" | "translation";
  times: number[];
  values: (readonly number[])[];
}

/** A named animation clip. */
export interface GlbClip {
  name: string;
  tracks: GlbTrack[];
}

/** Everything a generated model holds. */
export interface GlbModel {
  nodes: GlbNode[];
  materials: GlbMaterial[];
  clips: GlbClip[];
}

const FLOAT = 5126;
const USHORT = 5123;
const UINT = 5125;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function hexToLinear(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [linear((value >> 16) & 255), linear((value >> 8) & 255), linear(value & 255)];
}

/**
 * Encode a model as GLB bytes. Deterministic: the same model always gives the same bytes.
 * @capability glb-write write an animated binary glTF from meshes, nodes and clips made in code
 */
export function encodeGlb(model: GlbModel): Uint8Array {
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const bufferViews: Record<string, unknown>[] = [];
  const accessors: Record<string, unknown>[] = [];

  const addView = (bytes: Uint8Array, target?: number): number => {
    const pad = (4 - (byteLength % 4)) % 4;
    if (pad > 0) {
      chunks.push(new Uint8Array(pad));
      byteLength += pad;
    }
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.byteLength, ...(target === undefined ? {} : { target }) });
    chunks.push(bytes);
    byteLength += bytes.byteLength;
    return bufferViews.length - 1;
  };

  const floatAccessor = (values: readonly number[], type: "SCALAR" | "VEC3" | "VEC4", target?: number, bounds = false): number => {
    const width = type === "SCALAR" ? 1 : type === "VEC3" ? 3 : 4;
    const data = new Float32Array(values);
    const view = addView(new Uint8Array(data.buffer), target);
    const accessor: Record<string, unknown> = { bufferView: view, componentType: FLOAT, count: values.length / width, type };
    if (bounds) {
      const min = new Array<number>(width).fill(Infinity);
      const max = new Array<number>(width).fill(-Infinity);
      for (let i = 0; i < values.length; i += 1) {
        const k = i % width;
        const v = data[i]!;
        if (v < min[k]!) min[k] = v;
        if (v > max[k]!) max[k] = v;
      }
      accessor.min = min;
      accessor.max = max;
    }
    accessors.push(accessor);
    return accessors.length - 1;
  };

  const indexAccessor = (indices: readonly number[], vertexCount: number): number => {
    const wide = vertexCount > 65535;
    const data = wide ? new Uint32Array(indices) : new Uint16Array(indices);
    const view = addView(new Uint8Array(data.buffer, 0, data.byteLength), ELEMENT_ARRAY_BUFFER);
    accessors.push({ bufferView: view, componentType: wide ? UINT : USHORT, count: indices.length, type: "SCALAR" });
    return accessors.length - 1;
  };

  const meshes: Record<string, unknown>[] = [];
  const nodes = model.nodes.map((node) => {
    const out: Record<string, unknown> = { name: node.name, translation: [...node.translation] };
    if (node.rotation !== undefined) out.rotation = [...node.rotation];
    const parts = node.primitives.filter((part) => part.indices.length > 0);
    if (parts.length > 0) {
      meshes.push({
        name: node.name,
        primitives: parts.map((part) => ({
          attributes: {
            POSITION: floatAccessor(part.positions, "VEC3", ARRAY_BUFFER, true),
            NORMAL: floatAccessor(part.normals, "VEC3", ARRAY_BUFFER),
          },
          indices: indexAccessor(part.indices, part.positions.length / 3),
          material: part.material,
        })),
      });
      out.mesh = meshes.length - 1;
    }
    return out;
  });
  model.nodes.forEach((node, index) => {
    if (node.parent < 0) return;
    const parent = nodes[node.parent]!;
    parent.children = [...((parent.children as number[] | undefined) ?? []), index];
  });

  const animations = model.clips.map((clip) => {
    const samplers: Record<string, unknown>[] = [];
    const channels: Record<string, unknown>[] = [];
    for (const track of clip.tracks) {
      const input = floatAccessor(track.times, "SCALAR", undefined, true);
      const output = floatAccessor(track.values.flat(), track.path === "rotation" ? "VEC4" : "VEC3");
      samplers.push({ input, output, interpolation: "LINEAR" });
      channels.push({ sampler: samplers.length - 1, target: { node: track.node, path: track.path } });
    }
    return { name: clip.name, samplers, channels };
  });

  const json = {
    asset: { version: "2.0", generator: "jgengine creatureBody" },
    scene: 0,
    scenes: [{ nodes: model.nodes.flatMap((node, index) => (node.parent < 0 ? [index] : [])) }],
    nodes,
    meshes,
    materials: model.materials.map((material) => ({
      name: material.name,
      pbrMetallicRoughness: { baseColorFactor: [...hexToLinear(material.color), 1], metallicFactor: 0, roughnessFactor: material.roughness ?? 0.85 },
      ...(material.emissive === undefined ? {} : { emissiveFactor: hexToLinear(material.emissive) }),
    })),
    animations,
    accessors,
    bufferViews,
    buffers: [{ byteLength: byteLength + ((4 - (byteLength % 4)) % 4) }],
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadded = jsonBytes.byteLength + ((4 - (jsonBytes.byteLength % 4)) % 4);
  const binPadded = byteLength + ((4 - (byteLength % 4)) % 4);
  const total = 12 + 8 + jsonPadded + 8 + binPadded;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonPadded, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonPadded);
  const binStart = 20 + jsonPadded;
  dv.setUint32(binStart, binPadded, true);
  dv.setUint32(binStart + 4, 0x004e4942, true);
  let offset = binStart + 8;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Bytes as a `data:` URL any model loader fetches like a file.
 * @capability glb-data-url load generated GLB bytes through the normal model loader with no file on disk
 */
export function glbDataUrl(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += BASE64[(n >> 18) & 63]! + BASE64[(n >> 12) & 63]! + (b === undefined ? "=" : BASE64[(n >> 6) & 63]!) + (c === undefined ? "=" : BASE64[n & 63]!);
  }
  return `data:model/gltf-binary;base64,${out}`;
}
