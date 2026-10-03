/** Stored geometry and image inventory; triangles count mesh primitives once, regardless of scene instances. */
export interface GlbMetrics {
  glbBytes: number;
  /** GLB plus unique external buffer/image bytes; shared files count once per model. */
  byteLength: number;
  triangles: number;
  primitives: number;
  textures: readonly GlbTextureMetrics[];
  maxTextureDimension: number;
}

/** Dimensions and encoded bytes for one glTF image, including images referenced by texture extensions. */
export interface GlbTextureMetrics {
  image: number;
  width: number;
  height: number;
  byteLength: number;
}

interface Accessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
  sparse?: {
    count: number;
    indices: { bufferView: number; byteOffset?: number; componentType: number };
    values: { bufferView: number; byteOffset?: number };
  };
}
interface BufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
}
interface Gltf {
  asset?: { version?: string };
  buffers?: { uri?: string; byteLength: number }[];
  bufferViews?: BufferView[];
  accessors?: Accessor[];
  meshes?: {
    primitives: {
      attributes: Record<string, number>;
      indices?: number;
      mode?: number;
      extensions?: Record<string, unknown>;
    }[];
  }[];
  images?: { uri?: string; bufferView?: number }[];
  extensionsRequired?: string[];
}

function integer(value: number, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || value < minimum)
    throw new Error(`${label}: expected an integer >= ${minimum}`);
  return value;
}

function dataUri(uri: string): Uint8Array {
  const match = /^data:[^,]*;base64,([\s\S]*)$/i.exec(uri);
  if (match === null) throw new Error("only base64 data URIs are supported");
  return Uint8Array.from(atob(match[1]!), (character) => character.charCodeAt(0));
}

function imageSize(bytes: Uint8Array): [number, number] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, length: number) =>
    new TextDecoder().decode(bytes.subarray(offset, offset + length));
  if (
    bytes.length >= 24 &&
    view.getUint32(0) === 0x89504e47 &&
    view.getUint32(4) === 0x0d0a1a0a &&
    ascii(12, 4) === "IHDR"
  ) {
    return [view.getUint32(16), view.getUint32(20)];
  }
  if (
    bytes.length >= 48 &&
    ascii(1, 6) === "KTX 20" &&
    bytes[0] === 0xab &&
    bytes[7] === 0xbb &&
    view.getUint32(8) === 0x0d0a1a0a
  ) {
    return [view.getUint32(20, true), view.getUint32(24, true)];
  }
  if (bytes.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const kind = ascii(12, 4);
    if (kind === "VP8X") {
      const uint24 = (offset: number) =>
        bytes[offset]! + bytes[offset + 1]! * 256 + bytes[offset + 2]! * 65536;
      return [uint24(24) + 1, uint24(27) + 1];
    }
    if (kind === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff];
    }
    if (kind === "VP8L" && bytes[20] === 0x2f) {
      const bits = view.getUint32(21, true);
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    }
  }
  if (bytes.length >= 4 && view.getUint16(0) === 0xffd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) break;
      while (bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset++]!;
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        ) &&
        length >= 8
      ) {
        return [view.getUint16(offset + 5), view.getUint16(offset + 3)];
      }
      offset += length;
    }
  }
  throw new Error("unreadable image dimensions (supported: PNG, JPEG, WebP, KTX2)");
}

/**
 * Inspect GLB v2 geometry accessors and image headers offline. Throws on unreadable resources,
 * malformed geometry, or required geometry compression; never silently reports missing data as zero.
 * External resources are supplied by the caller; this function never fetches or decompresses bytes.
 * @capability asset-budgets measure bytes, triangles, and texture dimensions of imported GLB assets offline
 */
export function readGlbMetrics(
  bytes: Uint8Array,
  readResource?: (uri: string) => Uint8Array,
): GlbMetrics {
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length < 20 ||
    header.getUint32(0, true) !== 0x46546c67 ||
    header.getUint32(4, true) !== 2 ||
    header.getUint32(8, true) !== bytes.length
  ) {
    throw new Error("invalid GLB v2 header or file length");
  }
  let json: Gltf | undefined;
  let binary: Uint8Array | undefined;
  for (let offset = 12; offset < bytes.length; ) {
    if (offset + 8 > bytes.length) throw new Error("truncated GLB chunk header");
    const length = header.getUint32(offset, true);
    const kind = header.getUint32(offset + 4, true);
    const start = offset + 8;
    if (length % 4 !== 0 || start + length > bytes.length)
      throw new Error("invalid GLB chunk length");
    if (offset === 12 && kind !== 0x4e4f534a) throw new Error("first GLB chunk must be JSON");
    if (kind === 0x4e4f534a) {
      if (json !== undefined) throw new Error("duplicate GLB JSON chunk");
      json = JSON.parse(new TextDecoder().decode(bytes.subarray(start, start + length))) as Gltf;
    } else if (kind === 0x004e4942) {
      if (binary !== undefined) throw new Error("duplicate GLB BIN chunk");
      binary = bytes.subarray(start, start + length);
    }
    offset = start + length;
  }
  if (json?.asset?.version !== "2.0") throw new Error("missing glTF 2.0 asset metadata");
  if (
    json.extensionsRequired?.some(
      (name) => name === "KHR_draco_mesh_compression" || name === "EXT_meshopt_compression",
    )
  ) {
    throw new Error("compressed geometry requires a decoder before budget measurement");
  }
  let byteLength = bytes.length;
  const resources = new Map<string, Uint8Array>();
  const resource = (uri: string): Uint8Array => {
    if (resources.has(uri)) return resources.get(uri)!;
    const result = uri.startsWith("data:") ? dataUri(uri) : readResource?.(uri);
    if (result === undefined) throw new Error(`external resource not supplied: ${uri}`);
    if (!uri.startsWith("data:")) byteLength += result.length;
    resources.set(uri, result);
    return result;
  };
  const buffers = (json.buffers ?? []).map((buffer, index) => {
    const result =
      buffer.uri !== undefined ? resource(buffer.uri) : index === 0 ? binary : undefined;
    const length = integer(buffer.byteLength, `buffer ${index} byteLength`);
    if (result === undefined || result.length < length)
      throw new Error(`buffer ${index}: missing or truncated bytes`);
    return result.subarray(0, length);
  });
  const bufferView = (index: number): { bytes: Uint8Array; stride?: number } => {
    integer(index, "bufferView index");
    const entry = json.bufferViews?.[index];
    if (entry === undefined) throw new Error(`bufferView ${index}: missing`);
    const buffer = buffers[integer(entry.buffer, "buffer index")];
    const offset = integer(entry.byteOffset ?? 0, "bufferView byteOffset");
    const length = integer(entry.byteLength, "bufferView byteLength");
    if (buffer === undefined || offset + length > buffer.length)
      throw new Error(`bufferView ${index}: out of bounds`);
    return {
      bytes: buffer.subarray(offset, offset + length),
      stride: entry.byteStride,
    };
  };
  const accessor = (
    index: number,
    indices: boolean,
  ): { count: number; read?: (i: number) => number; maxIndex?: number } => {
    integer(index, "accessor index");
    const entry = json.accessors?.[index];
    if (entry === undefined) throw new Error(`accessor ${index}: missing`);
    const count = integer(entry.count, `accessor ${index} count`, 1);
    const componentBytes = (
      { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 } as Record<number, number>
    )[entry.componentType];
    if (
      componentBytes === undefined ||
      (indices && ![5121, 5123, 5125].includes(entry.componentType)) ||
      entry.type !== (indices ? "SCALAR" : "VEC3")
    ) {
      throw new Error(`accessor ${index}: invalid ${indices ? "index" : "POSITION"} type`);
    }
    const components = indices ? 1 : 3;
    const width = componentBytes * components;
    let read: ((i: number) => number) | undefined;
    let maxIndex: number | undefined;
    if (entry.bufferView !== undefined) {
      const source = bufferView(entry.bufferView);
      const stride = integer(source.stride ?? width, "accessor stride", width);
      const offset = integer(entry.byteOffset ?? 0, "accessor byteOffset");
      if (
        stride % componentBytes !== 0 ||
        offset % componentBytes !== 0 ||
        offset + (count - 1) * stride + width > source.bytes.length
      )
        throw new Error(`accessor ${index}: out of bounds or misaligned`);
      if (indices) {
        const view = new DataView(
          source.bytes.buffer,
          source.bytes.byteOffset,
          source.bytes.length,
        );
        read = (i) =>
          componentBytes === 1
            ? view.getUint8(offset + i * stride)
            : componentBytes === 2
              ? view.getUint16(offset + i * stride, true)
              : view.getUint32(offset + i * stride, true);
      }
    } else if (entry.sparse === undefined) {
      throw new Error(`accessor ${index}: no bufferView or sparse values`);
    }
    if (entry.sparse !== undefined) {
      const sparse = entry.sparse;
      const sparseCount = integer(sparse.count, "sparse count", 1);
      const source = bufferView(sparse.indices.bufferView).bytes;
      const values = bufferView(sparse.values.bufferView).bytes;
      const size = ({ 5121: 1, 5123: 2, 5125: 4 } as Record<number, number>)[
        sparse.indices.componentType
      ];
      const offset = integer(sparse.indices.byteOffset ?? 0, "sparse indices offset");
      const valueOffset = integer(sparse.values.byteOffset ?? 0, "sparse values offset");
      if (
        size === undefined ||
        sparseCount > count ||
        offset % size !== 0 ||
        valueOffset % componentBytes !== 0 ||
        offset + sparseCount * size > source.length ||
        valueOffset + sparseCount * width > values.length
      )
        throw new Error(`accessor ${index}: malformed sparse values`);
      const view = new DataView(source.buffer, source.byteOffset, source.length);
      const valueView = new DataView(values.buffer, values.byteOffset, values.length);
      const replacements = new Map<number, number>();
      let previous = -1;
      for (let i = 0; i < sparseCount; i += 1) {
        const position =
          size === 1
            ? view.getUint8(offset + i * size)
            : size === 2
              ? view.getUint16(offset + i * size, true)
              : view.getUint32(offset + i * size, true);
        if (position <= previous || position >= count)
          throw new Error(`accessor ${index}: sparse indices must be increasing and in bounds`);
        previous = position;
        if (indices)
          replacements.set(
            position,
            componentBytes === 1
              ? valueView.getUint8(valueOffset + i * width)
              : componentBytes === 2
                ? valueView.getUint16(valueOffset + i * width, true)
                : valueView.getUint32(valueOffset + i * width, true),
          );
      }
      if (indices) {
        const baseRead = read;
        read = (i) => replacements.get(i) ?? baseRead?.(i) ?? 0;
        if (baseRead === undefined) {
          maxIndex = 0;
          for (const value of replacements.values()) maxIndex = Math.max(maxIndex, value);
        }
      }
    }
    return { count, read, maxIndex };
  };
  let triangles = 0;
  let primitives = 0;
  for (const [meshIndex, mesh] of (json.meshes ?? []).entries()) {
    for (const [primitiveIndex, primitive] of mesh.primitives.entries()) {
      const label = `mesh ${meshIndex} primitive ${primitiveIndex}`;
      if (primitive.extensions?.KHR_draco_mesh_compression !== undefined)
        throw new Error(`${label}: Draco geometry requires a decoder`);
      const position = primitive.attributes?.POSITION;
      if (position === undefined) throw new Error(`${label}: missing POSITION`);
      const vertices = accessor(position, false);
      let count = vertices.count;
      if (primitive.indices !== undefined) {
        const indices = accessor(primitive.indices, true);
        count = indices.count;
        if (indices.maxIndex !== undefined) {
          if (indices.maxIndex >= vertices.count)
            throw new Error(`${label}: sparse index exceeds POSITION count ${vertices.count}`);
        } else {
          for (let i = 0; i < count; i += 1) {
            if (indices.read!(i) >= vertices.count)
              throw new Error(`${label}: index ${i} exceeds POSITION count ${vertices.count}`);
          }
        }
      }
      const mode = integer(primitive.mode ?? 4, `${label} mode`);
      if (mode > 6) throw new Error(`${label}: unsupported primitive mode ${mode}`);
      if (mode === 4 && count % 3 !== 0)
        throw new Error(`${label}: TRIANGLES count ${count} is not divisible by 3`);
      triangles += mode === 4 ? count / 3 : mode === 5 || mode === 6 ? Math.max(0, count - 2) : 0;
      primitives += 1;
    }
  }
  const textures = (json.images ?? []).map((image, index): GlbTextureMetrics => {
    const imageBytes =
      image.uri !== undefined
        ? resource(image.uri)
        : image.bufferView !== undefined
          ? bufferView(image.bufferView).bytes
          : undefined;
    if (imageBytes === undefined) throw new Error(`image ${index}: missing bytes`);
    let dimensions: [number, number];
    try {
      dimensions = imageSize(imageBytes);
    } catch (error) {
      throw new Error(`image ${index}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const width = integer(dimensions[0], `image ${index} width`, 1);
    const height = integer(dimensions[1], `image ${index} height`, 1);
    return { image: index, width, height, byteLength: imageBytes.length };
  });
  return {
    glbBytes: bytes.length,
    byteLength,
    triangles,
    primitives,
    textures,
    maxTextureDimension: textures.reduce(
      (maximum, texture) => Math.max(maximum, texture.width, texture.height),
      0,
    ),
  };
}
