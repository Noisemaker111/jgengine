/**
 * A small binary glTF reader for static models: every triangle mesh in the default scene, baked
 * into model space with its normals, texture coordinates, vertex colours and material. The inverse
 * of `glbWrite`, enough to take a downloaded static animal apart and rig it ({@link autoRig}).
 */

/** One material as the source file describes it. */
export interface ReadMaterial {
  name: string;
  /** Linear RGBA base colour factor. */
  baseColor: readonly [number, number, number, number];
  metalness: number;
  roughness: number;
  /** Linear RGB emissive factor. */
  emissive: readonly [number, number, number];
  doubleSided: boolean;
  /** Index into {@link ReadModel.images} of the base colour texture. */
  image?: number;
}

/** An image embedded in the source file, carried through untouched. */
export interface ReadImage {
  mimeType: string;
  bytes: Uint8Array;
}

/** One triangle mesh in model space. */
export interface ReadPrimitive {
  positions: Float32Array;
  normals: Float32Array;
  uvs?: Float32Array;
  /** Linear RGBA per vertex. */
  colors?: Float32Array;
  indices: Uint32Array;
  material: number;
}

/** Everything a static model holds. */
export interface ReadModel {
  primitives: ReadPrimitive[];
  materials: ReadMaterial[];
  images: ReadImage[];
  /** True when the file already has a skeleton or animations: it needs no rig. */
  animated: boolean;
}

type Mat4 = Float64Array;

const IDENTITY = (): Mat4 => new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float64Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + r]! * b[c * 4 + k]!;
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

function compose(t: readonly number[] = [0, 0, 0], q: readonly number[] = [0, 0, 0, 1], s: readonly number[] = [1, 1, 1]): Mat4 {
  const [x, y, z, w] = q as [number, number, number, number];
  const [sx, sy, sz] = s as [number, number, number];
  return new Float64Array([
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    t[0]!, t[1]!, t[2]!, 1,
  ]);
}

/** The inverse-transpose of a matrix's upper 3x3, for normals. */
function normalMatrix(m: Mat4): number[] {
  const a = m[0]!, b = m[1]!, c = m[2]!, d = m[4]!, e = m[5]!, f = m[6]!, g = m[8]!, h = m[9]!, i = m[10]!;
  const det = a * (e * i - f * h) - d * (b * i - c * h) + g * (b * f - c * e) || 1;
  // Columns of inverse-transpose.
  return [
    (e * i - f * h) / det, (g * f - d * i) / det, (d * h - g * e) / det,
    (h * c - b * i) / det, (a * i - g * c) / det, (g * b - a * h) / det,
    (b * f - e * c) / det, (d * c - a * f) / det, (a * e - d * b) / det,
  ];
}

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

interface GltfJson {
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: { mesh?: number; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; skin?: number }[];
  meshes?: { primitives: { attributes: Record<string, number>; indices?: number; material?: number; mode?: number }[] }[];
  accessors?: { bufferView?: number; byteOffset?: number; componentType: number; normalized?: boolean; count: number; type: string; sparse?: unknown }[];
  bufferViews?: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
  materials?: {
    name?: string;
    pbrMetallicRoughness?: { baseColorFactor?: number[]; baseColorTexture?: { index: number }; metallicFactor?: number; roughnessFactor?: number };
    emissiveFactor?: number[];
    doubleSided?: boolean;
  }[];
  textures?: { source?: number }[];
  images?: { bufferView?: number; mimeType?: string; uri?: string }[];
  skins?: unknown[];
  animations?: unknown[];
}

/**
 * Read a binary glTF into model-space triangle meshes.
 * @capability glb-read take a static GLB apart into model-space triangles, materials and textures
 */
export function readGlbModel(bytes: Uint8Array): ReadModel {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("readGlbModel: not a binary glTF");
  let offset = 12;
  let json: GltfJson | null = null;
  let bin: Uint8Array | null = null;
  while (offset + 8 <= bytes.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk)) as GltfJson;
    else if (type === 0x004e4942) bin = chunk;
    offset += 8 + length;
  }
  if (json === null) throw new Error("readGlbModel: no JSON chunk");
  const gltf = json;
  const buffer = bin ?? new Uint8Array(0);

  const viewBytes = (index: number): { bytes: Uint8Array; stride?: number } => {
    const def = gltf.bufferViews![index]!;
    if (def.buffer !== 0) throw new Error("readGlbModel: external buffers are not supported");
    return { bytes: buffer.subarray(def.byteOffset ?? 0, (def.byteOffset ?? 0) + def.byteLength), ...(def.byteStride === undefined ? {} : { stride: def.byteStride }) };
  };

  const accessor = (index: number): { data: Float32Array; width: number } => {
    const def = gltf.accessors![index]!;
    if (def.sparse !== undefined) throw new Error("readGlbModel: sparse accessors are not supported");
    const width = COMPONENTS[def.type] ?? 1;
    const out = new Float32Array(def.count * width);
    if (def.bufferView === undefined) return { data: out, width };
    const { bytes: source, stride } = viewBytes(def.bufferView);
    const dv = new DataView(source.buffer, source.byteOffset, source.byteLength);
    const size = def.componentType === 5126 || def.componentType === 5125 ? 4 : def.componentType === 5123 || def.componentType === 5122 ? 2 : 1;
    const step = stride ?? size * width;
    const base = def.byteOffset ?? 0;
    for (let i = 0; i < def.count; i += 1) {
      for (let k = 0; k < width; k += 1) {
        const at = base + i * step + k * size;
        let v: number;
        switch (def.componentType) {
          case 5126: v = dv.getFloat32(at, true); break;
          case 5125: v = dv.getUint32(at, true); break;
          case 5123: v = dv.getUint16(at, true); if (def.normalized === true) v /= 65535; break;
          case 5122: v = dv.getInt16(at, true); if (def.normalized === true) v = Math.max(v / 32767, -1); break;
          case 5121: v = dv.getUint8(at); if (def.normalized === true) v /= 255; break;
          case 5120: v = dv.getInt8(at); if (def.normalized === true) v = Math.max(v / 127, -1); break;
          default: throw new Error(`readGlbModel: component type ${def.componentType} is not supported`);
        }
        out[i * width + k] = v;
      }
    }
    return { data: out, width };
  };

  const images: ReadImage[] = (gltf.images ?? []).map((image) => {
    if (image.bufferView === undefined) throw new Error("readGlbModel: only embedded images are supported");
    return { mimeType: image.mimeType ?? "image/png", bytes: viewBytes(image.bufferView).bytes.slice() };
  });
  const materials: ReadMaterial[] = (gltf.materials ?? []).map((material, index) => {
    const pbr = material.pbrMetallicRoughness ?? {};
    const c = pbr.baseColorFactor ?? [1, 1, 1, 1];
    const e = material.emissiveFactor ?? [0, 0, 0];
    const texture = pbr.baseColorTexture === undefined ? undefined : gltf.textures?.[pbr.baseColorTexture.index]?.source;
    return {
      name: material.name ?? `material_${index}`,
      baseColor: [c[0] ?? 1, c[1] ?? 1, c[2] ?? 1, c[3] ?? 1],
      metalness: pbr.metallicFactor ?? 1,
      roughness: pbr.roughnessFactor ?? 1,
      emissive: [e[0] ?? 0, e[1] ?? 0, e[2] ?? 0],
      doubleSided: material.doubleSided === true,
      ...(texture === undefined ? {} : { image: texture }),
    };
  });
  let defaultMaterial = -1;

  const primitives: ReadPrimitive[] = [];
  const visit = (nodeIndex: number, parent: Mat4): void => {
    const node = gltf.nodes![nodeIndex]!;
    const local = node.matrix !== undefined ? new Float64Array(node.matrix) : compose(node.translation, node.rotation, node.scale);
    const world = multiply(parent, local);
    if (node.mesh !== undefined) {
      const nm = normalMatrix(world);
      const flip = (world[0]! * (world[5]! * world[10]! - world[6]! * world[9]!) - world[4]! * (world[1]! * world[10]! - world[2]! * world[9]!) + world[8]! * (world[1]! * world[6]! - world[2]! * world[5]!)) < 0;
      for (const prim of gltf.meshes![node.mesh]!.primitives) {
        if ((prim.mode ?? 4) !== 4) continue;
        const position = accessor(prim.attributes.POSITION!).data;
        const count = position.length / 3;
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i += 1) {
          const x = position[i * 3]!, y = position[i * 3 + 1]!, z = position[i * 3 + 2]!;
          positions[i * 3] = world[0]! * x + world[4]! * y + world[8]! * z + world[12]!;
          positions[i * 3 + 1] = world[1]! * x + world[5]! * y + world[9]! * z + world[13]!;
          positions[i * 3 + 2] = world[2]! * x + world[6]! * y + world[10]! * z + world[14]!;
        }
        let indices: Uint32Array;
        if (prim.indices === undefined) indices = Uint32Array.from({ length: count }, (_, i) => i);
        else indices = Uint32Array.from(accessor(prim.indices).data);
        if (flip) for (let t = 0; t < indices.length; t += 3) [indices[t + 1], indices[t + 2]] = [indices[t + 2]!, indices[t + 1]!];
        const normals = new Float32Array(count * 3);
        if (prim.attributes.NORMAL !== undefined) {
          const normal = accessor(prim.attributes.NORMAL).data;
          for (let i = 0; i < count; i += 1) {
            const x = normal[i * 3]!, y = normal[i * 3 + 1]!, z = normal[i * 3 + 2]!;
            const nx = nm[0]! * x + nm[3]! * y + nm[6]! * z;
            const ny = nm[1]! * x + nm[4]! * y + nm[7]! * z;
            const nz = nm[2]! * x + nm[5]! * y + nm[8]! * z;
            const l = Math.hypot(nx, ny, nz) || 1;
            normals[i * 3] = nx / l;
            normals[i * 3 + 1] = ny / l;
            normals[i * 3 + 2] = nz / l;
          }
        } else {
          faceNormals(positions, indices, normals);
        }
        const uv = prim.attributes.TEXCOORD_0 === undefined ? undefined : accessor(prim.attributes.TEXCOORD_0).data;
        let colors: Float32Array | undefined;
        if (prim.attributes.COLOR_0 !== undefined) {
          const color = accessor(prim.attributes.COLOR_0);
          colors = new Float32Array(count * 4);
          for (let i = 0; i < count; i += 1) {
            for (let k = 0; k < 3; k += 1) colors[i * 4 + k] = color.data[i * color.width + k]!;
            colors[i * 4 + 3] = color.width === 4 ? color.data[i * 4 + 3]! : 1;
          }
        }
        let material = prim.material ?? -1;
        if (material < 0) {
          if (defaultMaterial < 0) {
            materials.push({ name: "default", baseColor: [1, 1, 1, 1], metalness: 0, roughness: 1, emissive: [0, 0, 0], doubleSided: false });
            defaultMaterial = materials.length - 1;
          }
          material = defaultMaterial;
        }
        primitives.push({ positions, normals, ...(uv === undefined ? {} : { uvs: uv }), ...(colors === undefined ? {} : { colors }), indices, material });
      }
    }
    for (const child of node.children ?? []) visit(child, world);
  };
  const roots = gltf.scenes?.[gltf.scene ?? 0]?.nodes ?? [];
  for (const root of roots) visit(root, IDENTITY());

  return { primitives, materials, images, animated: (gltf.skins?.length ?? 0) > 0 || (gltf.animations?.length ?? 0) > 0 };
}

/** Flat-ish normals for a mesh that has none: each vertex gets the sum of its faces' normals. */
function faceNormals(positions: Float32Array, indices: Uint32Array, out: Float32Array): void {
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t]! * 3, b = indices[t + 1]! * 3, c = indices[t + 2]! * 3;
    const ux = positions[b]! - positions[a]!, uy = positions[b + 1]! - positions[a + 1]!, uz = positions[b + 2]! - positions[a + 2]!;
    const vx = positions[c]! - positions[a]!, vy = positions[c + 1]! - positions[a + 1]!, vz = positions[c + 2]! - positions[a + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) {
      out[v] = out[v]! + nx;
      out[v + 1] = out[v + 1]! + ny;
      out[v + 2] = out[v + 2]! + nz;
    }
  }
  for (let i = 0; i < out.length; i += 3) {
    const l = Math.hypot(out[i]!, out[i + 1]!, out[i + 2]!) || 1;
    out[i] = out[i]! / l;
    out[i + 1] = out[i + 1]! / l;
    out[i + 2] = out[i + 2]! / l;
  }
}
