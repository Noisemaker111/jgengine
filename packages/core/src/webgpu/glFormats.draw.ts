/**
 * WebGL 2 enums mapped to WebGPU, for the GL-shaped WebGPU context three's WebGLRenderer drives
 * (`webgpuGl.draw.ts`). GL numbers are written out so this file needs no browser globals.
 */

/** How a texture binds: decides the bind group layout entry and the sampler type. */
export type TextureBinding = "float" | "unfilterable" | "depth" | "uint" | "sint";

export interface GlTextureFormat {
  format: GPUTextureFormat;
  /** Bytes per texel as WebGPU stores it (a block for compressed formats). */
  bytes: number;
  /** Texel or block width and height. */
  block: number;
  /** GL source bytes per texel when they differ from `bytes` (RGB data widened to RGBA). */
  sourceBytes?: number;
  /** Widen GL's 3-channel source rows to 4 channels, with this alpha. */
  widen?: { channels: 3; alpha: number; element: 1 | 2 | 4 };
  renderable: boolean;
  binding: TextureBinding;
}

const f = (format: GPUTextureFormat, bytes: number, binding: TextureBinding = "float", renderable = true): GlTextureFormat => ({ format, bytes, block: 1, renderable, binding });
const c = (format: GPUTextureFormat, bytes: number): GlTextureFormat => ({ format, bytes, block: 4, renderable: false, binding: "float" });

/** Sized internal formats (texStorage, renderbufferStorage, sized texImage). */
const SIZED: Record<number, GlTextureFormat> = {
  0x8058: f("rgba8unorm", 4), // RGBA8
  0x8c43: f("rgba8unorm-srgb", 4), // SRGB8_ALPHA8
  0x8051: { ...f("rgba8unorm", 4), sourceBytes: 3, widen: { channels: 3, alpha: 255, element: 1 } }, // RGB8
  0x8c41: { ...f("rgba8unorm-srgb", 4), sourceBytes: 3, widen: { channels: 3, alpha: 255, element: 1 } }, // SRGB8
  0x881a: f("rgba16float", 8), // RGBA16F
  0x881b: { ...f("rgba16float", 8), sourceBytes: 6, widen: { channels: 3, alpha: 0x3c00, element: 2 } }, // RGB16F
  0x8814: f("rgba32float", 16), // RGBA32F
  0x8815: { ...f("rgba32float", 16), sourceBytes: 12, widen: { channels: 3, alpha: 1, element: 4 } }, // RGB32F
  0x8229: f("r8unorm", 1), // R8
  0x822b: f("rg8unorm", 2), // RG8
  0x822d: f("r16float", 2), // R16F
  0x822f: f("rg16float", 4), // RG16F
  0x822e: f("r32float", 4), // R32F
  0x8230: f("rg32float", 8), // RG32F
  0x8c3a: f("rg11b10ufloat", 4), // R11F_G11F_B10F
  0x8059: f("rgb10a2unorm", 4), // RGB10_A2
  0x8232: f("r8uint", 1, "uint"),
  0x8231: f("r8sint", 1, "sint"),
  0x8234: f("r16uint", 2, "uint"),
  0x8233: f("r16sint", 2, "sint"),
  0x8236: f("r32uint", 4, "uint"),
  0x8235: f("r32sint", 4, "sint"),
  0x8238: f("rg8uint", 2, "uint"),
  0x8237: f("rg8sint", 2, "sint"),
  0x823a: f("rg16uint", 4, "uint"),
  0x8239: f("rg16sint", 4, "sint"),
  0x823c: f("rg32uint", 8, "uint"),
  0x823b: f("rg32sint", 8, "sint"),
  0x8d7c: f("rgba8uint", 4, "uint"),
  0x8d8e: f("rgba8sint", 4, "sint"),
  0x8d76: f("rgba16uint", 8, "uint"),
  0x8d88: f("rgba16sint", 8, "sint"),
  0x8d70: f("rgba32uint", 16, "uint"),
  0x8d82: f("rgba32sint", 16, "sint"),
  0x81a5: f("depth24plus", 4, "depth"), // DEPTH_COMPONENT24
  0x81a6: f("depth24plus", 4, "depth"), // DEPTH_COMPONENT32 (WebGL 1 name)
  0x8cac: f("depth32float", 4, "depth"), // DEPTH_COMPONENT32F
  0x81a7: f("depth16unorm", 2, "depth"), // DEPTH_COMPONENT16
  0x88f0: f("depth24plus-stencil8", 4, "depth"), // DEPTH24_STENCIL8
  0x8cad: f("depth32float-stencil8", 8, "depth"), // DEPTH32F_STENCIL8
  0x8d48: f("stencil8", 1, "uint"), // STENCIL_INDEX8
  // Compressed (texture-compression-bc).
  0x83f0: c("bc1-rgba-unorm", 8), // COMPRESSED_RGB_S3TC_DXT1
  0x83f1: c("bc1-rgba-unorm", 8), // COMPRESSED_RGBA_S3TC_DXT1
  0x83f2: c("bc2-rgba-unorm", 16), // DXT3
  0x83f3: c("bc3-rgba-unorm", 16), // DXT5
  0x8c4c: c("bc1-rgba-unorm-srgb", 8), // COMPRESSED_SRGB_S3TC_DXT1
  0x8c4d: c("bc1-rgba-unorm-srgb", 8),
  0x8c4e: c("bc2-rgba-unorm-srgb", 16),
  0x8c4f: c("bc3-rgba-unorm-srgb", 16),
  0x8e8c: c("bc7-rgba-unorm", 16), // COMPRESSED_RGBA_BPTC_UNORM
  0x8e8d: c("bc7-rgba-unorm-srgb", 16), // COMPRESSED_SRGB_ALPHA_BPTC_UNORM
  0x8e8e: c("bc6h-rgb-float", 16), // COMPRESSED_RGB_BPTC_SIGNED_FLOAT
  0x8e8f: c("bc6h-rgb-ufloat", 16), // COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT
  0x8dbb: c("bc4-r-unorm", 8), // COMPRESSED_RED_RGTC1
  0x8dbc: c("bc4-r-snorm", 8),
  0x8dbd: c("bc5-rg-unorm", 16), // COMPRESSED_RED_GREEN_RGTC2
  0x8dbe: c("bc5-rg-snorm", 16),
};

/**
 * The WebGPU format for a GL internal format, or for an unsized one (`RGBA` + `UNSIGNED_BYTE`)
 * with its type. `null` when WebGPU has no such format.
 */
export function glTextureFormat(internal: number, format = 0, type = 0): GlTextureFormat | null {
  const sized = SIZED[internal];
  if (sized !== undefined) return sized;
  // Unsized: the format names channels, the type the storage.
  const channels = internal === 0x1908 || format === 0x1908 ? 4 : internal === 0x1907 || format === 0x1907 ? 3 : internal === 0x1903 || format === 0x1903 ? 1 : internal === 0x8227 || format === 0x8227 ? 2 : internal === 0x1902 ? -1 : internal === 0x84f9 ? -2 : 4;
  if (channels === -1) return SIZED[type === 0x1405 ? 0x8cac : type === 0x1403 ? 0x81a7 : 0x81a5]!;
  if (channels === -2) return SIZED[0x88f0]!;
  if (type === 0x1406) return SIZED[channels === 4 ? 0x8814 : channels === 3 ? 0x8815 : channels === 2 ? 0x8230 : 0x822e] ?? null;
  if (type === 0x140b || type === 0x8d61) return SIZED[channels === 4 ? 0x881a : channels === 3 ? 0x881b : channels === 2 ? 0x822f : 0x822d] ?? null;
  return SIZED[channels === 4 ? 0x8058 : channels === 3 ? 0x8051 : channels === 2 ? 0x822b : 0x8229] ?? null;
}

/** A texture format's bind type when `float32-filterable` is (or is not) enabled. */
export function textureBinding(format: GlTextureFormat, float32Filterable: boolean): TextureBinding {
  if (format.binding !== "float") return format.binding;
  if (!float32Filterable && (format.format === "rgba32float" || format.format === "rg32float" || format.format === "r32float")) return "unfilterable";
  return "float";
}

export function isDepthFormat(format: GPUTextureFormat): boolean {
  return format.startsWith("depth") || format === "stencil8";
}

export function hasStencil(format: GPUTextureFormat): boolean {
  return format.includes("stencil");
}

export function blendFactor(f: number): GPUBlendFactor {
  switch (f) {
    case 0: return "zero";
    case 1: return "one";
    case 0x300: return "src";
    case 0x301: return "one-minus-src";
    case 0x302: return "src-alpha";
    case 0x303: return "one-minus-src-alpha";
    case 0x304: return "dst-alpha";
    case 0x305: return "one-minus-dst-alpha";
    case 0x306: return "dst";
    case 0x307: return "one-minus-dst";
    case 0x308: return "src-alpha-saturated";
    case 0x8001: case 0x8003: return "constant";
    case 0x8002: case 0x8004: return "one-minus-constant";
    default: return "one";
  }
}

export function blendOperation(e: number): GPUBlendOperation {
  switch (e) {
    case 0x800a: return "subtract";
    case 0x800b: return "reverse-subtract";
    case 0x8007: return "min";
    case 0x8008: return "max";
    default: return "add";
  }
}

export function compareFunction(f: number): GPUCompareFunction {
  switch (f) {
    case 0x200: return "never";
    case 0x201: return "less";
    case 0x202: return "equal";
    case 0x203: return "less-equal";
    case 0x204: return "greater";
    case 0x205: return "not-equal";
    case 0x206: return "greater-equal";
    default: return "always";
  }
}

export function stencilOperation(op: number): GPUStencilOperation {
  switch (op) {
    case 0: return "zero";
    case 0x1e01: return "replace";
    case 0x1e02: return "increment-clamp";
    case 0x1e03: return "decrement-clamp";
    case 0x150a: return "invert";
    case 0x8507: return "increment-wrap";
    case 0x8508: return "decrement-wrap";
    default: return "keep";
  }
}

export function addressMode(wrap: number): GPUAddressMode {
  if (wrap === 0x2901) return "repeat";
  if (wrap === 0x8370) return "mirror-repeat";
  return "clamp-to-edge";
}

/** GL min filter: (filter, mipmap filter, samples mips). */
export function minFilter(m: number): [GPUFilterMode, GPUMipmapFilterMode, boolean] {
  switch (m) {
    case 0x2600: return ["nearest", "nearest", false];
    case 0x2700: return ["nearest", "nearest", true];
    case 0x2702: return ["nearest", "linear", true];
    case 0x2701: return ["linear", "nearest", true];
    case 0x2703: return ["linear", "linear", true];
    default: return ["linear", "nearest", false];
  }
}

/** GL draw mode to topology; LINE_LOOP and TRIANGLE_FAN have none (`null`). */
export function topology(mode: number): GPUPrimitiveTopology | null {
  switch (mode) {
    case 0: return "point-list";
    case 1: return "line-list";
    case 3: return "line-strip";
    case 4: return "triangle-list";
    case 5: return "triangle-strip";
    default: return null;
  }
}

/** Bytes of one component of a GL vertex attribute type. */
export function componentBytes(type: number): number {
  switch (type) {
    case 0x1400: case 0x1401: return 1; // BYTE, UNSIGNED_BYTE
    case 0x1402: case 0x1403: case 0x140b: return 2; // SHORT, UNSIGNED_SHORT, HALF_FLOAT
    default: return 4;
  }
}

/**
 * The WebGPU vertex format GL reads this attribute as, or `null` when none matches and the data
 * must be converted to Float32 (`readAsFloat`): unnormalized integers read by a float input (GL
 * turns 7 into 7.0) and 3-component 8/16-bit data.
 */
export function vertexFormat(type: number, size: number, normalized: boolean, integer: boolean, shaderKind: "f" | "i" | "u"): GPUVertexFormat | null {
  const n = size === 1 ? "" : `x${size}`;
  if (type === 0x1406) return shaderKind === "f" ? (`float32${n}` as GPUVertexFormat) : null;
  if (type === 0x140b) return size === 2 || size === 4 ? (`float16${n}` as GPUVertexFormat) : null;
  const signed = type === 0x1400 || type === 0x1402 || type === 0x1404;
  const bits = componentBytes(type) * 8;
  if (integer || shaderKind !== "f") {
    if (bits === 32) return (`${signed ? "sint" : "uint"}32${n}` as GPUVertexFormat);
    if (size === 3 || size === 1) return null;
    return (`${signed ? "sint" : "uint"}${bits}${n}` as GPUVertexFormat);
  }
  if (!normalized) return null;
  if (bits === 32 || size === 3 || size === 1) return null;
  return (`${signed ? "snorm" : "unorm"}${bits}${n}` as GPUVertexFormat);
}

/** One per-instance attribute of a draw, on its buffer's GL layout. */
export interface InstancedAttribute {
  /** The buffer's byte length. */
  size: number;
  offset: number;
  stride: number;
  /** Bytes one element of the attribute reads. */
  bytes: number;
  divisor: number;
}

/**
 * How many of `instances` the draw's per-instance buffers hold. WebGL draws the instances past the
 * end with zeroed attributes (robust access); WebGPU rejects or clamps such a draw by driver, so the
 * backend draws only these and reports the overrun.
 */
export function instancesThatFit(instances: number, attributes: readonly InstancedAttribute[]): number {
  let fit = instances;
  for (const a of attributes) {
    const elements = a.size < a.offset + a.bytes ? 0 : Math.floor((a.size - a.offset - a.bytes) / a.stride) + 1;
    fit = Math.min(fit, elements * a.divisor);
  }
  return Math.max(0, fit);
}
