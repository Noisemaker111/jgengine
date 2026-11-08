/**
 * A WebGL 2 context drawn with WebGPU. three's WebGLRenderer runs on it unchanged: it compiles the
 * same GLSL (translated to WGSL by `glslToWgsl`), sets the same uniforms and issues the same draws,
 * so every material, custom shader and post pass draws the same image. What changes is the
 * submission: uniforms land in one buffer per frame, pipelines and bind groups are cached, and
 * Chrome's GPU process encodes a few WebGPU commands per draw instead of WebGL's dozens.
 *
 * Conventions (shared with `native/crates/jg-render`): every pass is drawn with clip-space y
 * flipped, so render targets keep GL's memory layout (row 0 is GL's bottom row) and textures are
 * sampled with GL's coordinates unchanged; the default framebuffer is an offscreen texture copied
 * flipped onto the canvas when the frame is presented.
 */
import { translateGlslAsync, type PendingTranslation, type TranslateResult, type WgslProgram, type WgslSamplerSlot, type WgslUniformSlot } from "./glslToWgsl.draw";
import {
  addressMode,
  blendFactor,
  blendOperation,
  compareFunction,
  componentBytes,
  glTextureFormat,
  hasStencil,
  instancesThatFit,
  type InstancedAttribute,
  isDepthFormat,
  minFilter,
  stencilOperation,
  textureBinding,
  topology,
  vertexFormat,
  type GlTextureFormat,
  type TextureBinding,
} from "./glFormats.draw";

/* eslint-disable @typescript-eslint/no-explicit-any */

// WebGPU's flag namespaces (TypeScript's DOM lib types the interfaces but not these globals).
const GPUBufferUsage = { MAP_READ: 0x1, COPY_SRC: 0x4, COPY_DST: 0x8, INDEX: 0x10, VERTEX: 0x20, UNIFORM: 0x40, INDIRECT: 0x100, QUERY_RESOLVE: 0x200 } as const;
const GPUTextureUsage = { COPY_SRC: 0x1, COPY_DST: 0x2, TEXTURE_BINDING: 0x4, RENDER_ATTACHMENT: 0x10 } as const;
const GPUShaderStage = { VERTEX: 0x1, FRAGMENT: 0x2 } as const;
const GPUMapMode = { READ: 0x1 } as const;

/** Context attributes the canvas was asked for (WebGL's `getContextAttributes`). */
export interface WebGpuGlAttributes {
  alpha: boolean;
  antialias: boolean;
  depth: boolean;
  stencil: boolean;
  premultipliedAlpha: boolean;
  preserveDrawingBuffer: boolean;
  powerPreference: WebGLPowerPreference;
  failIfMajorPerformanceCaveat: boolean;
  desynchronized: boolean;
}

/** Counters a perf probe reads per frame. */
export interface WebGpuGlStats {
  frames: number;
  draws: number;
  passes: number;
  submits: number;
  pipelines: number;
  bindGroups: number;
  uniformBytes: number;
  /** Flushes forced by an upload into a resource the open batch already used. */
  orderFlushes: number;
  /** Programs linked, and the milliseconds spent translating them to WGSL. */
  programs: number;
  translateMs: number;
  /** Fences signaled, and the milliseconds from their submit to the GPU finishing. */
  fences: number;
  fenceMs: number;
  /** Pixel readbacks landed, and the milliseconds from their submit to the data arriving. */
  reads: number;
  readMs: number;
  /** How far behind the GPU queue ran at the last sample: milliseconds from a submit to its work finishing. */
  queueLagMs: number;
  /** Programs whose shaders the browser compiled ahead of their first draw, and the milliseconds those compiles took in all. */
  precompiles: number;
  precompileMs: number;
}

const UNIFORM_RING_BYTES = 4 << 20;
const MAX_UNITS = 32;

let nextId = 1;
let nextRevision = 1;
/** Timestamps one batch can write: two per render pass while a GPU timer runs. A batch past it times no more passes. */
const STAMPS_PER_BATCH = 4096;
/** Texture sets a program keeps before it starts over: a program drawn with every texture of a long session stays bounded. */
const MAX_TEXTURE_SETS = 512;

interface GlBuffer { kind: "buffer"; id: number; gpu: GPUBuffer | null; size: number; data: ArrayBufferView | null; version: number; usedBatch: number; floatCopies: Map<string, { version: number; gpu: GPUBuffer }> | null; deleted: boolean }
interface GlTexture {
  kind: "texture"; id: number; target: number; gpu: GPUTexture | null; format: GlTextureFormat | null; width: number; height: number; depth: number; levels: number; immutable: boolean;
  wrap: [number, number, number]; minFilter: number; magFilter: number; compareMode: number; compareFunc: number; anisotropy: number; baseLevel: number; maxLevel: number;
  samplerKey: string; views: Map<string, GPUTextureView>; usedBatch: number; deleted: boolean; definedLevels: number;
  /** Unique per change to what binding this texture means (storage, sampler state, deletion): a cached bind group made with an older revision is stale. */
  revision: number;
}
interface GlRenderbuffer { kind: "renderbuffer"; id: number; gpu: GPUTexture | null; format: GlTextureFormat | null; width: number; height: number; samples: number; view: GPUTextureView | null }
interface Attachment { object: GlTexture | GlRenderbuffer; level: number; layer: number }
interface GlFramebuffer { kind: "framebuffer"; id: number; colors: (Attachment | null)[]; depth: Attachment | null; stencil: Attachment | null; drawBuffers: number[]; version: number;
  /** Its pass, built once per change (see WebGpuGl.passPlan). */
  plan: PassPlan | null }
interface GlShader { kind: "shader"; id: number; type: number; source: string; compiled: boolean }
interface VertexAttrib { enabled: boolean; buffer: GlBuffer | null; size: number; type: number; normalized: boolean; stride: number; offset: number; divisor: number; integer: boolean }
interface GlVertexArray { kind: "vao"; id: number; attribs: VertexAttrib[]; elements: GlBuffer | null; version: number }
interface UniformLocation { program: GlProgram; slot: WgslUniformSlot | null; element: number; sampler: number }
interface GlQuery {
  kind: "query"; id: number; result: number; available: boolean;
  /** A TIME_ELAPSED query: the stamp serials of its first pass's start and its last pass's end so far (-1 for none), and those stamps once read back. */
  start: number; end: number; ended: boolean; startNs: number | null; endNs: number | null; endNsSerial: number;
}
interface GlProgram {
  kind: "program"; id: number; shaders: GlShader[]; linked: boolean; log: string; translated: WgslProgram | null; pending: PendingTranslation | null;
  vertex: GPUShaderModule | null; fragment: GPUShaderModule | null;
  /** Whether the browser has compiled the shaders for the GPU (see {@link WebGpuGl.precompile}). */
  compiled: boolean;
  uniforms: Map<string, WgslUniformSlot>; samplerIndex: Map<string, number>; active: { name: string; size: number; type: number }[]; attribs: { name: string; size: number; type: number; location: number }[];
  block: ArrayBuffer; f32: Float32Array; i32: Int32Array; u32: Uint32Array; bytes: Uint8Array; blockSize: number; dirty: boolean; slotBatch: number; slotOffset: number;
  units: Int32Array; layouts: Map<string, { group: GPUBindGroupLayout; pipeline: GPUPipelineLayout }>;
  /** Each vertex array's plan for this program, valid while the array's version is the one it was made at. */
  vertexCache: WeakMap<GlVertexArray, { version: number; plan: VertexPlan }>;
  /** Texture sets this program drew with, by a hash of their textures and revisions; see {@link WebGpuGl.textureSetFor}. */
  textureSets: Map<number, TextureSet[]>;
  /** The set this program last drew with, reused untested while `epoch` is the context's texture epoch. */
  lastTextures: TextureSet | null;
  /** Pipelines this program drew with, by a hash of what each was made for. */
  pipelineSets: Map<number, PipelineEntry[]>;
}
/** One combination of textures a program sampled, and the bind group made for it. */
interface TextureSet {
  epoch: number;
  /** Each slot's bound texture as bound (null when none), and its revision then. */
  bound: (GlTexture | null)[];
  revisions: number[];
  /** Each slot's texture as drawn: null where the bound one had no storage. */
  list: (GlTexture | null)[];
  sig: string;
  sigId: number;
  group: GPUBindGroup;
}
interface PipelineEntry { layoutId: number; stateId: number; targetId: number; mode: number; indexType: number | null; sigId: number; pipeline: GPURenderPipeline }
/** One attribute as GL reads it from its buffer. */
interface AttribSource { buffer: GlBuffer; offset: number; stride: number; type: number; size: number; normalized: boolean; convert: boolean; location: number; format: GPUVertexFormat }
interface VertexSlot {
  buffer: GlBuffer | null; offset: number; stride: number; step: GPUVertexStepMode; attributes: GPUVertexAttribute[]; convert: { type: number; size: number; normalized: boolean } | null; constant: boolean;
  sources: AttribSource[];
  /** Several GL buffers interleaved into one, built on the CPU when a draw has more buffers than WebGPU binds. */
  packed: { gpu: GPUBuffer | null; ids: number[]; versions: number[] } | null;
}
interface VertexPlan {
  /** The interned vertex layout (`key`): a plan rebuilt with the same layout keeps its pipelines. */
  id: number; key: string; slots: VertexSlot[]; constants: number[]; instanceCapacity: (instances: number) => number;
  /** Whether any GL attribute steps per instance (a multi-draw's firstInstance would offset it). */
  perInstance: boolean;
}
/** A WEBGL_multi_draw call: item i draws counts[countsOffset + i] from starts[startsOffset + i] (elements: a byte offset). */
interface MultiDraw { starts: ArrayLike<number>; startsOffset: number; counts: ArrayLike<number>; countsOffset: number; drawCount: number }
/** How many numbers describe the fixed-function state a pipeline bakes in (see `stateId`). */
const STATE_FIELDS = 29;

const WEBGL_CONSTANTS: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  const source = (globalThis as any).WebGL2RenderingContext;
  if (source === undefined) return out;
  for (const key of Object.getOwnPropertyNames(source)) {
    const value = source[key];
    if (typeof value === "number" && /^[A-Z0-9_]+$/.test(key)) out[key] = value;
  }
  return out;
})();

interface PassTarget { fb: GlFramebuffer | null; version: number; width: number; height: number; colorFormats: (GPUTextureFormat | null)[]; depthFormat: GPUTextureFormat | null; samples: number; key: string; id: number }
interface PendingClear { fb: GlFramebuffer | null; color: (GPUColor | null)[]; depth: number | null; stencil: number | null }
/** A framebuffer's pass, as {@link WebGpuGl.passPlan} builds it. */
interface PassPlan {
  /** What the attachments were when it was built (see {@link attachmentDeps}); the back buffer's views for the default framebuffer. */
  deps: unknown[];
  /** The GL color index each color attachment came from, for picking its clear value; -1 for a gap. */
  colorIndex: number[];
  /** Every attachment loaded and stored. */
  descriptor: GPURenderPassDescriptor;
  /** The attached textures, marked as used by each batch drawing into them. */
  textures: GlTexture[];
  target: PassTarget;
}

/** What makes an attachment's view stale: its texture's storage, or its renderbuffer's view. */
function attachmentDep(a: Attachment | null | undefined): unknown {
  return a == null ? null : a.object.kind === "texture" ? a.object.gpu : a.object.view;
}
function attachmentDeps(fb: GlFramebuffer): unknown[] {
  const out = [attachmentDep(fb.depth), attachmentDep(fb.stencil)];
  for (const a of fb.colors) out.push(attachmentDep(a));
  return out;
}
/** Whether `fb`'s attachments are still those {@link attachmentDeps} saw, without building a list. */
function sameDeps(fb: GlFramebuffer, deps: unknown[]): boolean {
  if (deps.length !== fb.colors.length + 2 || deps[0] !== attachmentDep(fb.depth) || deps[1] !== attachmentDep(fb.stencil)) return false;
  for (let i = 0; i < fb.colors.length; i += 1) if (deps[i + 2] !== attachmentDep(fb.colors[i])) return false;
  return true;
}
/** A depth/stencil attachment that loads and stores whichever aspects `format` has. */
function loadDepth(view: GPUTextureView, format: GPUTextureFormat): GPURenderPassDepthStencilAttachment {
  const a: GPURenderPassDepthStencilAttachment = { view };
  if (format !== "stencil8") { a.depthLoadOp = "load"; a.depthStoreOp = "store"; }
  if (format === "stencil8" || hasStencil(format)) { a.stencilLoadOp = "load"; a.stencilStoreOp = "store"; }
  return a;
}
/** `base` with `clear`'s values as clear load ops on the attachments it names. */
function withClears(base: GPURenderPassDescriptor, colorIndex: number[], clear: PendingClear): GPURenderPassDescriptor {
  const colors = [...base.colorAttachments].map((a, i) => {
    const value = a == null ? null : clear.color[colorIndex[i]!] ?? null;
    return a == null || value === null ? a : { ...a, loadOp: "clear" as const, clearValue: value };
  });
  let depth = base.depthStencilAttachment;
  if (depth !== undefined && (clear.depth != null || clear.stencil != null)) {
    depth = { ...depth };
    if (clear.depth != null && depth.depthLoadOp !== undefined) { depth.depthLoadOp = "clear"; depth.depthClearValue = clear.depth; }
    if (clear.stencil != null && depth.stencilLoadOp !== undefined) { depth.stencilLoadOp = "clear"; depth.stencilClearValue = clear.stencil; }
  }
  return depth === undefined ? { colorAttachments: colors } : { colorAttachments: colors, depthStencilAttachment: depth };
}

/** A small, stable number for a string, assigned on first sight. */
function internId(ids: Map<string, number>, key: string): number {
  let id = ids.get(key);
  if (id === undefined) {
    id = ids.size + 1;
    ids.set(key, id);
  }
  return id;
}

/** GL's active-uniform type enum for a translated slot. */
function uniformType(slot: WgslUniformSlot): number {
  if (slot.columns > 1) {
    if (slot.columns === 2 && slot.rows === 2) return 0x8b5a;
    if (slot.columns === 3 && slot.rows === 3) return 0x8b5b;
    if (slot.columns === 4 && slot.rows === 4) return 0x8b5c;
    return 0x8b5c;
  }
  const n = slot.rows;
  if (slot.kind === "f") return [0x1406, 0x8b50, 0x8b51, 0x8b52][n - 1]!;
  if (slot.kind === "u") return [0x1405, 0x8dc6, 0x8dc7, 0x8dc8][n - 1]!;
  return [0x1404, 0x8b53, 0x8b54, 0x8b55][n - 1]!;
}

function samplerType(s: WgslSamplerSlot): number {
  if (s.kind === "Depth") return s.dim === "Cube" ? 0x8dc5 : s.dim === "D2Array" ? 0x8dc4 : 0x8b62;
  const base = s.dim === "Cube" ? 0x8b60 : s.dim === "D3" ? 0x8b5f : s.dim === "D2Array" ? 0x8dc1 : 0x8b5e;
  if (s.kind === "Sint") return s.dim === "Cube" ? 0x8dcc : s.dim === "D3" ? 0x8dcb : s.dim === "D2Array" ? 0x8dcf : 0x8dca;
  if (s.kind === "Uint") return s.dim === "Cube" ? 0x8dd4 : s.dim === "D3" ? 0x8dd3 : s.dim === "D2Array" ? 0x8dd7 : 0x8dd2;
  return base;
}

/** The GLSL line a translation error names ("Fragment line 67: ..."), quoted, so the warning says what to fix. @internal */
export function failingLine(error: string, shaders: readonly { type: number; source: string }[]): string {
  const match = /^(Vertex|Fragment) line (\d+)/.exec(error);
  if (match === null) return "";
  const shader = shaders.find((s) => s.type === (match[1] === "Vertex" ? 0x8b31 : 0x8b30));
  const line = shader?.source.split("\n")[Number(match[2]) - 1]?.trim();
  return line === undefined || line === "" ? "" : ` (at: ${line.slice(0, 200)})`;
}

function dimTarget(dim: WgslSamplerSlot["dim"]): number {
  return dim === "Cube" ? 0x8513 : dim === "D3" ? 0x806f : dim === "D2Array" ? 0x8c1a : 0x0de1;
}

function viewDimension(dim: WgslSamplerSlot["dim"]): GPUTextureViewDimension {
  return dim === "Cube" ? "cube" : dim === "D3" ? "3d" : dim === "D2Array" ? "2d-array" : "2d";
}

function mipCount(w: number, h: number, d = 1): number {
  return Math.floor(Math.log2(Math.max(w, h, d, 1))) + 1;
}

function asView(data: any): ArrayBufferView {
  if (ArrayBuffer.isView(data)) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(0);
}

/** The vertex input a multi-draw program reads its `gl_DrawID` from. @internal */
export const DRAW_ID_INPUT = "jgDrawId";
const MULTI_DRAW_EXTENSION = /^[ \t]*#extension[ \t]+GL_ANGLE_multi_draw[ \t]*:[ \t]*\w+[ \t]*$/m;

/**
 * A vertex shader compiled against WEBGL_multi_draw (three's BatchedMesh), with `gl_DrawID` read
 * from an integer instance attribute: each item of a multi-draw is drawn with `firstInstance` set
 * to its index, and that attribute's buffer holds 0, 1, 2... so item i reads i. WGSL has no draw
 * index of its own. Every line keeps its number, so a translation error still names the right one.
 * Shaders without the extension come back unchanged. @internal
 */
export function withDrawIdInput(vertex: string): string {
  if (!MULTI_DRAW_EXTENSION.test(vertex)) return vertex;
  const lines = vertex.replace(MULTI_DRAW_EXTENSION, "#define GL_ANGLE_multi_draw 1").replace(/\bgl_DrawID\b/g, DRAW_ID_INPUT).split("\n");
  // The declaration shares the first line of code, after the #version and #define lines.
  const first = lines.findIndex((line) => line.trim() !== "" && !line.trimStart().startsWith("#"));
  if (first >= 0) lines[first] = `in highp int ${DRAW_ID_INPUT}; ${lines[first]}`;
  return lines.join("\n");
}

const PRESENT_WGSL = `
@group(0) @binding(0) var src: texture_2d<f32>;
struct Out { @builtin(position) pos: vec4<f32> };
@vertex fn vs(@builtin(vertex_index) i: u32) -> Out {
  let p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  return Out(vec4(p[i], 0.0, 1.0));
}
@fragment fn fs(o: Out) -> @location(0) vec4<f32> {
  let size = textureDimensions(src);
  let c = textureLoad(src, vec2<i32>(i32(o.pos.x), i32(size.y) - 1 - i32(o.pos.y)), 0);
  return c;
}`;

const MIP_WGSL = `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
struct Out { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vs(@builtin(vertex_index) i: u32) -> Out {
  let p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  return Out(vec4(p[i], 0.0, 1.0), vec2(p[i].x * 0.5 + 0.5, 0.5 - p[i].y * 0.5));
}
@fragment fn fs(o: Out) -> @location(0) vec4<f32> { return textureSampleLevel(src, smp, o.uv, 0.0); }`;

/** A WebGPU device ready for one canvas, from {@link requestWebGpuDevice}. */
export interface WebGpuDevice {
  device: GPUDevice;
  /** The adapter's description, reported as the GL renderer string. */
  label: string;
}

/**
 * Request the WebGPU device, or `null` when this browser has no usable WebGPU adapter. This is the
 * only asynchronous step; {@link createWebGpuGl} then makes the context synchronously, so a renderer
 * factory never awaits (see `engineRenderer.draw.ts` for why that matters).
 */
export async function requestWebGpuDevice(powerPreference: WebGLPowerPreference = "high-performance"): Promise<WebGpuDevice | null> {
  const gpu = (globalThis.navigator as any)?.gpu as GPU | undefined;
  if (gpu === undefined) return null;
  const adapter = await gpu.requestAdapter({ powerPreference: powerPreference === "low-power" ? "low-power" : "high-performance" });
  if (adapter === null) return null;
  const wanted: GPUFeatureName[] = ["texture-compression-bc", "float32-filterable", "float32-blendable", "timestamp-query", "depth32float-stencil8", "rg11b10ufloat-renderable"];
  const requiredFeatures = wanted.filter((name) => adapter.features.has(name));
  const device = await adapter.requestDevice({
    requiredFeatures,
    requiredLimits: { maxColorAttachmentBytesPerSample: Math.min(adapter.limits.maxColorAttachmentBytesPerSample, 64), maxTextureDimension2D: adapter.limits.maxTextureDimension2D, maxBufferSize: adapter.limits.maxBufferSize, maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize, maxSampledTexturesPerShaderStage: adapter.limits.maxSampledTexturesPerShaderStage, maxSamplersPerShaderStage: adapter.limits.maxSamplersPerShaderStage, maxUniformBufferBindingSize: adapter.limits.maxUniformBufferBindingSize, maxInterStageShaderVariables: adapter.limits.maxInterStageShaderVariables, maxVertexAttributes: adapter.limits.maxVertexAttributes, maxVertexBuffers: adapter.limits.maxVertexBuffers },
  });
  const info = (adapter as any).info as GPUAdapterInfo | undefined;
  return { device, label: info === undefined ? "WebGPU" : `${info.vendor} ${info.architecture} ${info.description}`.trim() };
}

/** The GL-shaped context for `canvas` on a device from {@link requestWebGpuDevice}, or `null` when the canvas gives no WebGPU context. */
export function createWebGpuGl(canvas: HTMLCanvasElement, gpu: WebGpuDevice, attributes: Partial<WebGpuGlAttributes> = {}): WebGpuGl | null {
  const context = canvas.getContext("webgpu") as GPUCanvasContext | null;
  if (context === null) return null;
  return new WebGpuGl(canvas, gpu.device, context, attributes, gpu.label);
}

/**
 * WebGL's constants (`gl.TEXTURE_2D` and the rest), on a prototype as the native context keeps them.
 * Copied onto each instance instead, the ~560 properties put the context in V8's dictionary mode,
 * so every method call three made on it and every field it read was a hash lookup.
 */
class GlConstants {}
Object.assign(GlConstants.prototype, WEBGL_CONSTANTS);

/** The GL-shaped context. Construct through {@link createWebGpuGl}. */
export class WebGpuGl extends GlConstants {
  readonly canvas: HTMLCanvasElement;
  readonly device: GPUDevice;
  readonly stats: WebGpuGlStats = { frames: 0, draws: 0, passes: 0, submits: 0, pipelines: 0, bindGroups: 0, uniformBytes: 0, orderFlushes: 0, programs: 0, translateMs: 0, fences: 0, fenceMs: 0, reads: 0, readMs: 0, queueLagMs: 0, precompiles: 0, precompileMs: 0 };
  /** Every distinct problem a draw hit, once each (also printed once). */
  readonly warnings = new Map<string, number>();
  drawingBufferColorSpace: PredefinedColorSpace = "srgb";
  unpackColorSpace: PredefinedColorSpace = "srgb";
  private readonly gpuContext: GPUCanvasContext;
  private readonly attributes: WebGpuGlAttributes;
  private readonly renderer: string;
  private readonly float32Filterable: boolean;
  private readonly float32Blendable: boolean;
  private readonly canvasFormat: GPUTextureFormat;
  private readonly uniformLayout: GPUBindGroupLayout;
  private readonly emptyLayout: GPUBindGroupLayout;
  private readonly emptyGroup: GPUBindGroup;

  // GL state.
  private error = 0;
  private program: GlProgram | null = null;
  private arrayBuffer: GlBuffer | null = null;
  private copyRead: GlBuffer | null = null;
  private copyWrite: GlBuffer | null = null;
  private pixelPack: GlBuffer | null = null;
  private pixelUnpack: GlBuffer | null = null;
  private uniformBuffer: GlBuffer | null = null;
  private readonly defaultVao: GlVertexArray;
  private vao: GlVertexArray;
  private drawFb: GlFramebuffer | null = null;
  private readFb: GlFramebuffer | null = null;
  private renderbuffer: GlRenderbuffer | null = null;
  private activeUnit = 0;
  private readonly units: Map<number, GlTexture | null>[] = Array.from({ length: MAX_UNITS }, () => new Map());
  private readonly generic: Float32Array[] = Array.from({ length: 32 }, () => new Float32Array([0, 0, 0, 1]));
  private viewportBox = [0, 0, 0, 0];
  private scissorBox = [0, 0, 0, 0];
  private readonly enabled = new Set<number>();
  private blendEq = [0x8006, 0x8006];
  private blendFn = [1, 0, 1, 0];
  private blendColorValue = [0, 0, 0, 0];
  private depthFn = 0x201;
  private depthWrite = true;
  private colorWrite = [true, true, true, true];
  private cull = 0x405;
  private front = 0x901;
  private offset = [0, 0];
  private clearColorValue = [0, 0, 0, 0];
  private clearDepthValue = 1;
  private clearStencilValue = 0;
  private stencilFront = { func: 0x207, ref: 0, mask: 0xff, fail: 0x1e00, zfail: 0x1e00, zpass: 0x1e00, writeMask: 0xff };
  private stencilBack = { func: 0x207, ref: 0, mask: 0xff, fail: 0x1e00, zfail: 0x1e00, zpass: 0x1e00, writeMask: 0xff };
  private readonly pixelStore = new Map<number, number | boolean>([[0x0cf5, 4], [0x0d05, 4], [0x9240, false], [0x9241, false], [0x9243, 0x9244]]);
  private stateVersion = 1;
  /**
   * Bumped by every change that can alter what a program's samplers resolve to: a binding, a
   * sampler uniform, texture parameters, storage, deletion. A program's cached bind group holds
   * while the epoch it was made at is current.
   */
  private textureEpoch = 1;
  private stateKeyVersion = 0;
  private stateKeyId = 0;
  /**
   * The pipeline state's fields, written in place and interned by value: three flips depth, blend
   * and stencil state hundreds of times a frame (Fernwild: 214), and building a string key each time
   * was a fifth of the context's garbage.
   */
  private readonly stateFields = new Float64Array(STATE_FIELDS);
  private readonly stateTable = new Map<number, { fields: Float64Array; id: number }[]>();
  private stateCount = 0;

  // GPU timers: once a page has begun a TIME_ELAPSED query, every render pass writes a timestamp at its
  // start and end. Serials count stamps across batches; a batch's stamps are its serials from
  // `stampFirst`, resolved and read back after it is submitted.
  private readonly stamps: GPUQuerySet | null = null;
  private readonly stampResolve: GPUBuffer | null = null;
  private stampSerial = 0;
  private stampFirst = 0;
  private stampOverflowed = false;
  private timedQuery: GlQuery | null = null;
  /** A TIME_ELAPSED query has been begun: from then on every pass writes stamps. */
  private timersInUse = false;
  /** The open pass's begin stamp serial, or -1 when no pass is open or it writes none. */
  private openPassStamp = -1;
  /** TIME_ELAPSED queries begun and not yet answered. */
  private readonly timedPending = new Set<GlQuery>();
  /** Small numbers for the strings a pipeline depends on, so a draw compares numbers instead of building a key. */
  private readonly targetIds = new Map<string, number>();
  private readonly layoutIds = new Map<string, number>();
  private readonly sigIds = new Map<string, number>();

  // WebGPU work.
  private encoder: GPUCommandEncoder | null = null;
  private pass: GPURenderPassEncoder | null = null;
  private passTarget: PassTarget | null = null;
  private pendingClear: PendingClear | null = null;
  private batch = 1;
  private staging = new Uint8Array(UNIFORM_RING_BYTES);
  private stagingUsed = 0;
  private ring: GPUBuffer;
  private ringGroups = new Map<number, GPUBindGroup>();
  /** The one dynamic offset a uniform bind takes, passed as a typed array: an array literal per draw allocated and went through the binding's slow sequence conversion. */
  private readonly dynamicOffset = new Uint32Array(1);
  private readonly uniformAlign: number;
  /** `device.limits.maxVertexBuffers`, read once: each read of it is two native getter calls, and a draw read it every time. */
  private readonly maxVertexBuffers: number;
  /** `device.queue`, read once for the same reason. */
  private readonly queue: GPUQueue;
  private constants = new Float32Array(1 << 16);
  private constantsUsed = 0;
  private constantRing: GPUBuffer;
  private readonly pipelines = new Map<string, GPURenderPipeline>();
  private readonly bindGroups = new Map<string, GPUBindGroup>();
  private readonly samplers = new Map<string, GPUSampler>();
  private boundPipeline: GPURenderPipeline | null = null;
  private boundGroup1: GPUBindGroup | null = null;
  private boundUniform = -1;
  private boundVertex: (GPUBuffer | null)[] = [];
  private boundVertexOffset: number[] = [];
  private boundIndex: GPUBuffer | null = null;
  private boundIndexFormat: GPUIndexFormat | null = null;
  /** The viewportBox / scissorBox (null: scissor off) / blendColorValue arrays the pass last applied; undefined when the pass has applied none. Their setters replace the arrays, so identity tells a change. */
  private boundView: number[] | undefined = undefined;
  private boundScissor: number[] | null | undefined = undefined;
  private boundRef = -1;
  private boundBlend: number[] | undefined = undefined;
  private presentScheduled = false;
  private backDirty = false;
  private lagSampling = false;
  private backColor: GPUTexture | null = null;
  private backColorMsaa: GPUTexture | null = null;
  private backDepth: GPUTexture | null = null;
  private backViews: { color: GPUTextureView; msaa: GPUTextureView | null; depth: GPUTextureView | null } | null = null;
  /** The default framebuffer's pass, for the current {@link backViews}. */
  private backPlan: PassPlan | null = null;
  private backSize = [0, 0];
  private presentPipeline: GPURenderPipeline | null = null;
  private presentGroup: GPUBindGroup | null = null;
  private readonly mipPipelines = new Map<string, GPURenderPipeline>();
  private mipSampler: GPUSampler | null = null;
  private readonly defaultVertex: GPUBuffer;

  constructor(canvas: HTMLCanvasElement, device: GPUDevice, context: GPUCanvasContext, attributes: Partial<WebGpuGlAttributes>, renderer: string) {
    super();
    this.canvas = canvas;
    this.device = device;
    this.gpuContext = context;
    this.renderer = renderer;
    this.attributes = { alpha: true, antialias: true, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: "high-performance", failIfMajorPerformanceCaveat: false, desynchronized: false, ...attributes };
    this.float32Filterable = device.features.has("float32-filterable");
    this.float32Blendable = device.features.has("float32-blendable");
    if (device.features.has("timestamp-query")) {
      this.stamps = device.createQuerySet({ type: "timestamp", count: STAMPS_PER_BATCH });
      this.stampResolve = device.createBuffer({ size: STAMPS_PER_BATCH * 8, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
    }
    this.canvasFormat = (globalThis.navigator as any).gpu.getPreferredCanvasFormat();
    context.configure({ device, format: this.canvasFormat, alphaMode: this.attributes.alpha ? "premultiplied" : "opaque", usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this.uniformAlign = device.limits.minUniformBufferOffsetAlignment;
    this.maxVertexBuffers = device.limits.maxVertexBuffers;
    this.queue = device.queue;
    this.uniformLayout = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform", hasDynamicOffset: true } }] });
    this.emptyLayout = device.createBindGroupLayout({ entries: [] });
    this.emptyGroup = device.createBindGroup({ layout: this.emptyLayout, entries: [] });
    this.ring = device.createBuffer({ size: UNIFORM_RING_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.constantRing = device.createBuffer({ size: this.constants.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.defaultVertex = device.createBuffer({ size: 64, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.defaultVertex, 0, new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]));
    this.defaultVao = this.makeVao();
    this.vao = this.defaultVao;
    this.viewportBox = [0, 0, canvas.width, canvas.height];
    this.scissorBox = [0, 0, canvas.width, canvas.height];
    device.addEventListener("uncapturederror", (event: any) => this.warn(`WebGPU: ${event.error?.message ?? event}`));
  }

  get drawingBufferWidth(): number { return this.canvas.width; }
  get drawingBufferHeight(): number { return this.canvas.height; }

  /**
   * Destroy a GPU resource once nothing recorded can still use it: after the open batch is
   * submitted (a destroyed texture in a submit invalidates the whole command buffer).
   */
  private retire(resource: GPUBuffer | GPUTexture | null | undefined): void {
    if (resource === null || resource === undefined) return;
    if (this.encoder === null) resource.destroy();
    else this.afterSubmit.push(() => resource.destroy());
  }

  private warn(message: string): void {
    const seen = this.warnings.get(message) ?? 0;
    this.warnings.set(message, seen + 1);
    if (seen === 0) console.warn(`[jgengine webgpu] ${message}`);
  }

  private touchState(): void { this.stateVersion += 1; }

  // ---------------------------------------------------------------- context queries

  getContextAttributes(): WebGpuGlAttributes { return { ...this.attributes }; }
  /** Set once three (or React Three Fiber on unmount) forces a context loss: the device is gone. */
  private contextLost = false;
  isContextLost(): boolean { return this.contextLost; }
  /**
   * `WEBGL_lose_context.loseContext`: React Three Fiber calls it through three's `forceContextLoss`
   * when a canvas unmounts. Destroying the device frees its memory and stops any work it still has
   * queued, which otherwise keeps running beside the next canvas's device.
   */
  private loseContext(): void {
    if (this.contextLost) return;
    this.contextLost = true;
    this.gpuContext.unconfigure();
    this.device.destroy();
  }
  getError(): number { const e = this.error; this.error = 0; return e; }
  makeXRCompatible(): Promise<void> { return Promise.resolve(); }
  /**
   * WEBGL_multi_draw draws a BatchedMesh in one call: its items share every binding and only
   * `gl_DrawID` changes, which the shader reads from an instance attribute ({@link withDrawIdInput}).
   * Without it three drew each item itself with a `_gl_DrawID` uniform, so every item re-staged the
   * program's whole uniform block and rebound it.
   */
  getSupportedExtensions(): string[] { return ["EXT_color_buffer_float", "EXT_color_buffer_half_float", "EXT_texture_filter_anisotropic", "KHR_parallel_shader_compile", "WEBGL_lose_context", "WEBGL_multi_draw", ...(this.float32Filterable ? ["OES_texture_float_linear"] : []), ...(this.float32Blendable ? ["EXT_float_blend"] : []), ...(this.stamps !== null ? ["EXT_disjoint_timer_query_webgl2"] : []), ...(this.device.features.has("texture-compression-bc") ? ["WEBGL_compressed_texture_s3tc", "WEBGL_compressed_texture_s3tc_srgb", "EXT_texture_compression_bptc", "EXT_texture_compression_rgtc"] : [])]; }

  getExtension(name: string): any {
    if (!this.getSupportedExtensions().includes(name)) return null;
    switch (name) {
      case "EXT_texture_filter_anisotropic": return { TEXTURE_MAX_ANISOTROPY_EXT: 0x84fe, MAX_TEXTURE_MAX_ANISOTROPY_EXT: 0x84ff };
      case "KHR_parallel_shader_compile": return { COMPLETION_STATUS_KHR: 0x91b1 };
      case "EXT_disjoint_timer_query_webgl2": return { QUERY_COUNTER_BITS_EXT: 0x8864, TIME_ELAPSED_EXT: 0x88bf, TIMESTAMP_EXT: 0x8e28, GPU_DISJOINT_EXT: 0x8fbb, queryCounterEXT: () => this.warn("queryCounterEXT (a single timestamp) is not supported on the WebGPU backend; use TIME_ELAPSED_EXT") };
      case "WEBGL_lose_context": return { loseContext: () => this.loseContext(), restoreContext: () => this.warn("degraded: restoreContext is not supported on the WebGPU backend; remount the canvas") };
      // The instanced forms are left out: an item's firstInstance carries its draw id, which would
      // also offset gl_InstanceID and every per-instance attribute. three draws only these two.
      case "WEBGL_multi_draw": return {
        multiDrawArraysWEBGL: (mode: number, firsts: ArrayLike<number>, firstsOffset: number, counts: ArrayLike<number>, countsOffset: number, drawCount: number) => this.draw(mode, 0, 1, 1, null, 0, { starts: firsts, startsOffset: firstsOffset, counts, countsOffset, drawCount }),
        multiDrawElementsWEBGL: (mode: number, counts: ArrayLike<number>, countsOffset: number, type: number, offsets: ArrayLike<number>, offsetsOffset: number, drawCount: number) => this.draw(mode, 0, 1, 1, type, 0, { starts: offsets, startsOffset: offsetsOffset, counts, countsOffset, drawCount }),
      };
      case "WEBGL_compressed_texture_s3tc": return { COMPRESSED_RGB_S3TC_DXT1_EXT: 0x83f0, COMPRESSED_RGBA_S3TC_DXT1_EXT: 0x83f1, COMPRESSED_RGBA_S3TC_DXT3_EXT: 0x83f2, COMPRESSED_RGBA_S3TC_DXT5_EXT: 0x83f3 };
      case "WEBGL_compressed_texture_s3tc_srgb": return { COMPRESSED_SRGB_S3TC_DXT1_EXT: 0x8c4c, COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT: 0x8c4d, COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT: 0x8c4e, COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT: 0x8c4f };
      case "EXT_texture_compression_bptc": return { COMPRESSED_RGBA_BPTC_UNORM_EXT: 0x8e8c, COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT: 0x8e8d, COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT: 0x8e8e, COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT: 0x8e8f };
      case "EXT_texture_compression_rgtc": return { COMPRESSED_RED_RGTC1_EXT: 0x8dbb, COMPRESSED_SIGNED_RED_RGTC1_EXT: 0x8dbc, COMPRESSED_RED_GREEN_RGTC2_EXT: 0x8dbd, COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT: 0x8dbe };
      default: return {};
    }
  }

  getParameter(p: number): any {
    const limits = this.device.limits;
    switch (p) {
      case 0x1f00: return "WebKit";
      case 0x1f01: return `WebKit WebGL (jgengine WebGPU: ${this.renderer})`;
      case 0x1f02: return "WebGL 2.0 (jgengine WebGPU)";
      case 0x8b8c: return "WebGL GLSL ES 3.00";
      case 0x0d33: case 0x84e8: return limits.maxTextureDimension2D; // MAX_TEXTURE_SIZE, MAX_RENDERBUFFER_SIZE
      case 0x851c: return limits.maxTextureDimension2D; // MAX_CUBE_MAP_TEXTURE_SIZE
      case 0x8073: return limits.maxTextureDimension3D;
      case 0x88ff: return limits.maxTextureArrayLayers;
      case 0x8872: case 0x8b4c: return Math.min(16, limits.maxSampledTexturesPerShaderStage); // MAX_TEXTURE_IMAGE_UNITS, MAX_VERTEX_TEXTURE_IMAGE_UNITS
      case 0x8b4d: return 32; // MAX_COMBINED_TEXTURE_IMAGE_UNITS
      case 0x8869: return Math.min(16, limits.maxVertexAttributes);
      case 0x8dfb: return 4096; // MAX_VERTEX_UNIFORM_VECTORS
      case 0x8dfd: return 1024; // MAX_FRAGMENT_UNIFORM_VECTORS
      case 0x8dfc: return limits.maxInterStageShaderVariables - 1; // MAX_VARYING_VECTORS
      case 0x8d57: return 4; // MAX_SAMPLES
      case 0x8824: case 0x8cdf: return limits.maxColorAttachments; // MAX_DRAW_BUFFERS, MAX_COLOR_ATTACHMENTS
      case 0x84ff: return 16;
      case 0x0d3a: return new Int32Array([limits.maxTextureDimension2D, limits.maxTextureDimension2D]);
      case 0x8a2f: return 24; // MAX_UNIFORM_BUFFER_BINDINGS
      case 0x8a30: return limits.maxUniformBufferBindingSize;
      case 0x8a34: return this.uniformAlign;
      case 0x8d6b: return 0xffffffff; // MAX_ELEMENT_INDEX
      case 0x0ba2: return new Int32Array(this.viewportBox);
      case 0x0c10: return new Int32Array(this.scissorBox);
      case 0x8b8d: return this.program;
      case 0x8894: return this.arrayBuffer;
      case 0x8895: return this.vao.elements;
      case 0x85b5: return this.vao === this.defaultVao ? null : this.vao;
      case 0x8ca6: return this.drawFb;
      case 0x8caa: return this.readFb;
      case 0x84e0: return 0x84c0 + this.activeUnit;
      case 0x0b72: return this.depthWrite;
      case 0x0c23: return [...this.colorWrite];
      case 0x0c22: return new Float32Array(this.clearColorValue);
      case 0x0d50: case 0x0d52: case 0x0d53: case 0x0d54: case 0x0d55: return 8; // bits
      case 0x0d56: return this.attributes.depth ? 24 : 0;
      case 0x0d57: return this.attributes.stencil ? 8 : 0;
      case 0x0d32: return 4; // MAX_CLIP_PLANES
      case 0x846d: return new Float32Array([1, 1]); // ALIASED_POINT_SIZE_RANGE
      case 0x846e: return new Float32Array([1, 1]); // ALIASED_LINE_WIDTH_RANGE
      case 0x8b4a: return 4096; // MAX_VERTEX_UNIFORM_COMPONENTS
      case 0x8b49: return 4096;
      case 0x9122: case 0x9125: return 64; // MAX_VERTEX/FRAGMENT_INPUT_COMPONENTS
      case 0x8fbb: return false; // GPU_DISJOINT_EXT: WebGPU timestamps do not jump
      default: return null;
    }
  }

  getShaderPrecisionFormat(): { rangeMin: number; rangeMax: number; precision: number } { return { rangeMin: 127, rangeMax: 127, precision: 23 }; }

  // ---------------------------------------------------------------- state

  enable(cap: number): void { if (!this.enabled.has(cap)) { this.enabled.add(cap); this.touchState(); } }
  disable(cap: number): void { if (this.enabled.delete(cap)) this.touchState(); }
  isEnabled(cap: number): boolean { return this.enabled.has(cap); }
  viewport(x: number, y: number, w: number, h: number): void { this.viewportBox = [x, y, w, h]; }
  scissor(x: number, y: number, w: number, h: number): void { this.scissorBox = [x, y, w, h]; }
  blendEquation(m: number): void { this.blendEq = [m, m]; this.touchState(); }
  blendEquationSeparate(a: number, b: number): void { this.blendEq = [a, b]; this.touchState(); }
  blendFunc(s: number, d: number): void { this.blendFn = [s, d, s, d]; this.touchState(); }
  blendFuncSeparate(a: number, b: number, c2: number, d: number): void { this.blendFn = [a, b, c2, d]; this.touchState(); }
  blendColor(r: number, g: number, b: number, a: number): void { this.blendColorValue = [r, g, b, a]; }
  depthFunc(f: number): void { this.depthFn = f; this.touchState(); }
  depthMask(m: boolean): void { this.depthWrite = m; this.touchState(); }
  depthRange(): void {}
  colorMask(r: boolean, g: boolean, b: boolean, a: boolean): void { this.colorWrite = [r, g, b, a]; this.touchState(); }
  cullFace(m: number): void { this.cull = m; this.touchState(); }
  frontFace(m: number): void { this.front = m; this.touchState(); }
  polygonOffset(factor: number, units: number): void { this.offset = [factor, units]; this.touchState(); }
  lineWidth(): void {}
  clearColor(r: number, g: number, b: number, a: number): void { this.clearColorValue = [r, g, b, a]; }
  clearDepth(d: number): void { this.clearDepthValue = d; }
  clearStencil(s: number): void { this.clearStencilValue = s; }
  stencilMask(m: number): void { this.stencilFront.writeMask = m; this.stencilBack.writeMask = m; this.touchState(); }
  stencilMaskSeparate(face: number, m: number): void { if (face !== 0x0405) this.stencilFront.writeMask = m; if (face !== 0x0404) this.stencilBack.writeMask = m; this.touchState(); }
  stencilFunc(func: number, ref: number, mask: number): void { Object.assign(this.stencilFront, { func, ref, mask }); Object.assign(this.stencilBack, { func, ref, mask }); this.touchState(); }
  stencilFuncSeparate(face: number, func: number, ref: number, mask: number): void { if (face !== 0x0405) Object.assign(this.stencilFront, { func, ref, mask }); if (face !== 0x0404) Object.assign(this.stencilBack, { func, ref, mask }); this.touchState(); }
  stencilOp(fail: number, zfail: number, zpass: number): void { Object.assign(this.stencilFront, { fail, zfail, zpass }); Object.assign(this.stencilBack, { fail, zfail, zpass }); this.touchState(); }
  stencilOpSeparate(face: number, fail: number, zfail: number, zpass: number): void { if (face !== 0x0405) Object.assign(this.stencilFront, { fail, zfail, zpass }); if (face !== 0x0404) Object.assign(this.stencilBack, { fail, zfail, zpass }); this.touchState(); }
  pixelStorei(p: number, v: number | boolean): void { this.pixelStore.set(p, v); }
  hint(): void {}
  sampleCoverage(): void {}
  flush(): void {}
  finish(): void { this.submit(); }

  // ---------------------------------------------------------------- buffers

  createBuffer(): GlBuffer { return { kind: "buffer", id: nextId++, gpu: null, size: 0, data: null, version: 0, usedBatch: 0, floatCopies: null, deleted: false }; }
  deleteBuffer(b: GlBuffer | null): void { if (b === null) return; b.deleted = true; this.retire(b.gpu); b.gpu = null; for (const c2 of b.floatCopies?.values() ?? []) this.retire(c2.gpu); b.floatCopies = null; }
  isBuffer(b: unknown): boolean { return (b as GlBuffer | null)?.kind === "buffer"; }

  bindBuffer(target: number, b: GlBuffer | null): void {
    switch (target) {
      case 0x8892: this.arrayBuffer = b; break;
      // A vertex plan reads only the attributes, so the index buffer leaves the vao's version alone.
      case 0x8893: this.vao.elements = b; break;
      case 0x8f36: this.copyRead = b; break;
      case 0x8f37: this.copyWrite = b; break;
      case 0x88eb: this.pixelPack = b; break;
      case 0x88ec: this.pixelUnpack = b; break;
      case 0x8a11: this.uniformBuffer = b; break;
      default: break;
    }
  }
  bindBufferBase(target: number, _index: number, b: GlBuffer | null): void { this.bindBuffer(target, b); this.warn("uniform buffer objects (three's UniformsGroup) are not drawn yet"); }
  bindBufferRange(target: number, index: number, b: GlBuffer | null): void { this.bindBufferBase(target, index, b); }

  private bufferFor(target: number): GlBuffer | null {
    switch (target) {
      case 0x8892: return this.arrayBuffer;
      case 0x8893: return this.vao.elements;
      case 0x8f36: return this.copyRead;
      case 0x8f37: return this.copyWrite;
      case 0x88eb: return this.pixelPack;
      case 0x88ec: return this.pixelUnpack;
      case 0x8a11: return this.uniformBuffer;
      default: return null;
    }
  }

  bufferData(target: number, data: any, _usage: number, srcOffset = 0, length = 0): void {
    const b = this.bufferFor(target);
    if (b === null) { this.error = 0x0502; return; }
    let view: ArrayBufferView;
    if (typeof data === "number") view = new Uint8Array(data);
    else {
      const src = asView(data);
      const element = (src as any).BYTES_PER_ELEMENT ?? 1;
      view = srcOffset === 0 && length === 0 ? src : new Uint8Array(src.buffer, src.byteOffset + srcOffset * element, (length === 0 ? src.byteLength / element - srcOffset : length) * element);
    }
    const size = Math.max(4, Math.ceil(view.byteLength / 4) * 4);
    if (b.gpu === null || b.size !== size) {
      if (b.gpu !== null && b.usedBatch === this.batch) this.orderFlush();
      this.retire(b.gpu);
      b.gpu = this.device.createBuffer({ size, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | GPUBufferUsage.UNIFORM });
      b.size = size;
    } else if (b.usedBatch === this.batch) this.orderFlush();
    b.data = view;
    b.version += 1;
    this.writeBuffer(b.gpu, 0, view);
  }

  bufferSubData(target: number, dstOffset: number, data: any, srcOffset = 0, length = 0): void {
    const b = this.bufferFor(target);
    if (b === null || b.gpu === null) { this.error = 0x0502; return; }
    const src = asView(data);
    const element = (src as any).BYTES_PER_ELEMENT ?? 1;
    const view = new Uint8Array(src.buffer, src.byteOffset + srcOffset * element, length === 0 ? src.byteLength - srcOffset * element : length * element);
    if (b.usedBatch === this.batch) this.orderFlush();
    // Keep the CPU copy current: three passes views of the attribute's own array, so usually it already is.
    if (b.data !== null && b.data.buffer !== src.buffer) {
      const whole = new Uint8Array(b.data.buffer, b.data.byteOffset, b.data.byteLength);
      if (dstOffset + view.byteLength <= whole.byteLength) whole.set(view, dstOffset);
    }
    b.version += 1;
    this.writeBuffer(b.gpu, dstOffset, view);
  }

  private writeBuffer(gpu: GPUBuffer, offset: number, view: ArrayBufferView): void {
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    if (offset % 4 === 0 && bytes.byteLength % 4 === 0) { this.queue.writeBuffer(gpu, offset, bytes); return; }
    // WebGPU writes whole 4-byte words: widen the range and fill it from the CPU copy where known.
    const start = offset - (offset % 4);
    const end = Math.min(gpu.size, Math.ceil((offset + bytes.byteLength) / 4) * 4);
    const padded = new Uint8Array(end - start);
    padded.set(bytes.subarray(0, Math.min(bytes.byteLength, padded.byteLength - (offset - start))), offset - start);
    this.queue.writeBuffer(gpu, start, padded);
  }

  copyBufferSubData(readTarget: number, writeTarget: number, readOffset: number, writeOffset: number, size: number): void {
    const from = this.bufferFor(readTarget);
    const to = this.bufferFor(writeTarget);
    if (from?.gpu == null || to?.gpu == null) return;
    this.endPass();
    this.ensureEncoder().copyBufferToBuffer(from.gpu, readOffset, to.gpu, writeOffset, size);
    to.version += 1;
  }

  /**
   * Read a buffer's CPU copy. A pixel-pack buffer's copy is filled when its queued `readPixels`
   * finishes, which a fence after it reports (the asynchronous pattern WebGL 2 readbacks use).
   */
  getBufferSubData(target: number, srcOffset: number, dst: ArrayBufferView, dstOffset = 0, length = 0): void {
    const b = this.bufferFor(target);
    if (b === null || b.data === null) { this.error = 0x0502; return; }
    const element = (dst as any).BYTES_PER_ELEMENT ?? 1;
    const out = new Uint8Array(dst.buffer, dst.byteOffset + dstOffset * element, length > 0 ? length * element : dst.byteLength - dstOffset * element);
    const from = new Uint8Array(b.data.buffer, b.data.byteOffset, b.data.byteLength);
    out.set(from.subarray(srcOffset, srcOffset + out.byteLength));
  }

  // ---------------------------------------------------------------- vertex arrays

  private makeVao(): GlVertexArray {
    return { kind: "vao", id: nextId++, attribs: Array.from({ length: 32 }, () => ({ enabled: false, buffer: null, size: 4, type: 0x1406, normalized: false, stride: 0, offset: 0, divisor: 0, integer: false })), elements: null, version: 1 };
  }
  createVertexArray(): GlVertexArray { return this.makeVao(); }
  deleteVertexArray(v: GlVertexArray | null): void { if (v !== null && this.vao === v) this.vao = this.defaultVao; }
  isVertexArray(v: unknown): boolean { return (v as GlVertexArray | null)?.kind === "vao"; }
  bindVertexArray(v: GlVertexArray | null): void { this.vao = v ?? this.defaultVao; }
  enableVertexAttribArray(i: number): void { const a = this.vao.attribs[i]!; if (!a.enabled) { a.enabled = true; this.vao.version += 1; } }
  disableVertexAttribArray(i: number): void { const a = this.vao.attribs[i]!; if (a.enabled) { a.enabled = false; this.vao.version += 1; } }
  vertexAttribPointer(i: number, size: number, type: number, normalized: boolean, stride: number, offset: number): void { this.setAttrib(i, size, type, normalized, stride, offset, false); }
  vertexAttribIPointer(i: number, size: number, type: number, stride: number, offset: number): void { this.setAttrib(i, size, type, false, stride, offset, true); }
  /** Point attribute `i` at the bound array buffer. Re-pointing it where it already points (three does every frame for some objects) keeps the vao's vertex plan. */
  private setAttrib(i: number, size: number, type: number, normalized: boolean, stride: number, offset: number, integer: boolean): void {
    const a = this.vao.attribs[i]!;
    const buffer = this.arrayBuffer;
    if (a.buffer === buffer && a.size === size && a.type === type && a.normalized === normalized && a.stride === stride && a.offset === offset && a.integer === integer) return;
    a.buffer = buffer; a.size = size; a.type = type; a.normalized = normalized; a.stride = stride; a.offset = offset; a.integer = integer;
    this.vao.version += 1;
  }
  vertexAttribDivisor(i: number, d: number): void { const a = this.vao.attribs[i]!; if (a.divisor !== d) { a.divisor = d; this.vao.version += 1; } }
  vertexAttrib1f(i: number, x: number): void { this.generic[i]!.set([x, 0, 0, 1]); }
  vertexAttrib2f(i: number, x: number, y: number): void { this.generic[i]!.set([x, y, 0, 1]); }
  vertexAttrib3f(i: number, x: number, y: number, z: number): void { this.generic[i]!.set([x, y, z, 1]); }
  vertexAttrib4f(i: number, x: number, y: number, z: number, w: number): void { this.generic[i]!.set([x, y, z, w]); }
  vertexAttrib1fv(i: number, v: ArrayLike<number>): void { this.vertexAttrib1f(i, v[0]!); }
  vertexAttrib2fv(i: number, v: ArrayLike<number>): void { this.vertexAttrib2f(i, v[0]!, v[1]!); }
  vertexAttrib3fv(i: number, v: ArrayLike<number>): void { this.vertexAttrib3f(i, v[0]!, v[1]!, v[2]!); }
  vertexAttrib4fv(i: number, v: ArrayLike<number>): void { this.vertexAttrib4f(i, v[0]!, v[1]!, v[2]!, v[3]!); }

  // ---------------------------------------------------------------- shaders and programs

  createShader(type: number): GlShader { return { kind: "shader", id: nextId++, type, source: "", compiled: false }; }
  deleteShader(): void {}
  shaderSource(s: GlShader, source: string): void { s.source = source; }
  compileShader(s: GlShader): void { s.compiled = true; }
  getShaderParameter(_s: GlShader, p: number): any { return p === 0x8b81 ? true : p === 0x8b4f ? _s.type : null; }
  getShaderInfoLog(): string { return ""; }
  getShaderSource(s: GlShader): string { return s.source; }
  isShader(s: unknown): boolean { return (s as GlShader | null)?.kind === "shader"; }

  createProgram(): GlProgram {
    return {
      kind: "program", id: nextId++, shaders: [], linked: false, log: "", translated: null, pending: null, vertex: null, fragment: null, compiled: false,
      uniforms: new Map(), samplerIndex: new Map(), active: [], attribs: [],
      block: new ArrayBuffer(16), f32: new Float32Array(4), i32: new Int32Array(4), u32: new Uint32Array(4), bytes: new Uint8Array(16), blockSize: 16, dirty: true, slotBatch: 0, slotOffset: 0,
      units: new Int32Array(0), layouts: new Map(), vertexCache: new WeakMap(), textureSets: new Map(), lastTextures: null, pipelineSets: new Map(),
    };
  }
  deleteProgram(): void {}
  isProgram(p: unknown): boolean { return (p as GlProgram | null)?.kind === "program"; }
  attachShader(p: GlProgram, s: GlShader): void { p.shaders.push(s); }
  detachShader(p: GlProgram, s: GlShader): void { p.shaders = p.shaders.filter((x) => x !== s); }
  bindAttribLocation(): void {}

  linkProgram(p: GlProgram): void {
    const vs = p.shaders.find((s) => s.type === 0x8b31);
    const fs = p.shaders.find((s) => s.type === 0x8b30);
    if (vs === undefined || fs === undefined) { p.linked = false; p.log = "a vertex and a fragment shader are needed"; return; }
    // Translation runs on worker threads; KHR_parallel_shader_compile's completion status reports
    // it, and any question about the program before then finishes it here.
    p.linked = false;
    p.translated = null;
    p.compiled = false;
    const pending = translateGlslAsync(withDrawIdInput(vs.source), fs.source);
    p.pending = pending;
    // Settle as soon as the worker answers, so the browser's compile starts without waiting for a query.
    pending.onDone(() => { if (p.pending === pending) this.settle(p); });
    this.stats.programs += 1;
  }

  /** Finish `p`'s link: take the worker's translation, or translate now if it has not arrived. */
  private settle(p: GlProgram): void {
    const pending = p.pending;
    if (pending === null) return;
    p.pending = null;
    const started = performance.now();
    const result: TranslateResult = pending.finish();
    this.stats.translateMs += performance.now() - started;
    if ("error" in result) {
      p.linked = false;
      p.log = result.error;
      this.warn(`a program did not translate to WGSL: ${result.error.split("\n")[0]}${failingLine(result.error, p.shaders)}`);
      return;
    }
    const t = result.ok;
    p.translated = t;
    p.vertex = this.device.createShaderModule({ code: t.vertex_wgsl });
    p.fragment = this.device.createShaderModule({ code: t.fragment_wgsl });
    p.blockSize = Math.max(16, Math.ceil(t.layout.uniform_size / 16) * 16);
    p.block = new ArrayBuffer(p.blockSize);
    p.f32 = new Float32Array(p.block);
    p.i32 = new Int32Array(p.block);
    p.u32 = new Uint32Array(p.block);
    p.bytes = new Uint8Array(p.block);
    p.dirty = true;
    p.uniforms.clear();
    p.active = [];
    for (const slot of t.layout.uniforms) {
      p.uniforms.set(slot.name, slot);
      p.active.push({ name: slot.array || slot.count > 1 ? `${slot.name}[0]` : slot.name, size: slot.count, type: uniformType(slot) });
    }
    p.samplerIndex.clear();
    const samplerNames = new Map<string, { first: number; count: number; slot: WgslSamplerSlot }>();
    t.layout.samplers.forEach((s, index) => {
      const known = samplerNames.get(s.name);
      if (known === undefined) samplerNames.set(s.name, { first: index, count: 1, slot: s });
      else known.count += 1;
      p.samplerIndex.set(`${s.name}[${s.element}]`, index);
      if (s.element === 0) p.samplerIndex.set(s.name, index);
    });
    // An array of one is still `name[0]`, as GL reports it: three binds an array uniform's textures
    // only under that name (Deepward's one spot shadow got three's 1x1 color placeholder otherwise).
    for (const [name, { count, slot }] of samplerNames) p.active.push({ name: count > 1 || slot.array === true ? `${name}[0]` : name, size: count, type: samplerType(slot) });
    p.units = new Int32Array(t.layout.samplers.length);
    p.attribs = [];
    const seen = new Set<string>();
    for (const input of t.layout.vertex_inputs) {
      if (input.column !== 0 || seen.has(input.name)) continue;
      seen.add(input.name);
      const columns = t.layout.vertex_inputs.filter((i) => i.name === input.name).length;
      const type = columns === 4 ? 0x8b5c : columns === 3 ? 0x8b5b : input.kind === "f" ? [0x1406, 0x8b50, 0x8b51, 0x8b52][input.components - 1]! : input.kind === "i" ? [0x1404, 0x8b53, 0x8b54, 0x8b55][input.components - 1]! : [0x1405, 0x8dc6, 0x8dc7, 0x8dc8][input.components - 1]!;
      p.attribs.push({ name: input.name, size: 1, type, location: input.location });
    }
    p.layouts.clear();
    p.vertexCache = new WeakMap();
    p.textureSets.clear();
    p.lastTextures = null;
    p.pipelineSets.clear();
    p.linked = true;
    p.log = "";
    this.precompile(p);
  }

  /**
   * Have the browser compile `p`'s shaders for the GPU now, off the queue and alongside other
   * programs, through one stand-in pipeline. The browser keeps the compiled shaders, so the
   * pipelines draws build later, whatever their targets, blending or vertex layout, take a couple of
   * milliseconds instead of a compile each (measured on Harbor Heat's programs: 59 compiled one at a
   * time 12-28 s, side by side 2.4 s; the real-state pipelines after them 0.15 s in all). The
   * program reports complete (KHR_parallel_shader_compile) once this lands, so the engine's shader
   * warmup waits for the real cost.
   */
  private precompile(p: GlProgram): void {
    const t = p.translated!;
    const sig = t.layout.samplers.map((s) => (s.kind === "Depth" ? "d" : s.kind === "Sint" ? "I" : s.kind === "Uint" ? "U" : "f")).join("");
    const inputs = t.layout.vertex_inputs;
    const attributes: GPUVertexAttribute[] = inputs.map((input, i) => ({ shaderLocation: input.location, offset: i * 16, format: input.kind === "f" ? "float32x4" : input.kind === "i" ? "sint32x4" : "uint32x4" }));
    const started = performance.now();
    let descriptor: GPURenderPipelineDescriptor;
    try {
      descriptor = {
        layout: this.programLayout(p, sig).pipeline,
        vertex: { module: p.vertex!, entryPoint: "main", buffers: attributes.length === 0 ? [] : [{ arrayStride: attributes.length * 16, stepMode: "vertex", attributes }] },
        fragment: { module: p.fragment!, entryPoint: "main", targets: Array.from({ length: t.layout.fragment_outputs }, () => ({ format: "rgba8unorm" as GPUTextureFormat })) },
        primitive: { topology: "triangle-list" },
        depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less-equal" },
      };
    } catch (error) {
      this.warn(`degraded: a program's shaders were not compiled ahead of its first draw: ${error instanceof Error ? error.message : String(error)}`);
      p.compiled = true;
      return;
    }
    void this.device.createRenderPipelineAsync(descriptor).then(
      () => {
        this.stats.precompiles += 1;
        this.stats.precompileMs += performance.now() - started;
      },
      (error: unknown) => this.warn(`degraded: a program's shaders were not compiled ahead of its first draw: ${error instanceof Error ? error.message : String(error)}`),
    ).finally(() => { p.compiled = true; });
  }

  getProgramParameter(p: GlProgram, pname: number): any {
    if (pname === 0x91b1) { // COMPLETION_STATUS_KHR: translated, and compiled by the browser
      if (p.pending !== null && !p.pending.done()) return false;
      this.settle(p);
      return !p.linked || p.compiled;
    }
    this.settle(p);
    switch (pname) {
      case 0x8b82: return p.linked; // LINK_STATUS
      case 0x8b83: return p.linked; // VALIDATE_STATUS
      case 0x8b86: return p.active.length; // ACTIVE_UNIFORMS
      case 0x8b89: return p.attribs.length; // ACTIVE_ATTRIBUTES
      case 0x8b85: return p.shaders.length;
      case 0x8a36: return 0; // ACTIVE_UNIFORM_BLOCKS
      case 0x8b80: return false; // DELETE_STATUS
      default: return null;
    }
  }
  getProgramInfoLog(p: GlProgram): string { this.settle(p); return p.log; }
  validateProgram(): void {}
  getActiveUniform(p: GlProgram, i: number): { name: string; size: number; type: number } | null { this.settle(p); return p.active[i] ?? null; }
  getActiveAttrib(p: GlProgram, i: number): { name: string; size: number; type: number } | null { this.settle(p); return p.attribs[i] ?? null; }
  getAttribLocation(p: GlProgram, name: string): number { this.settle(p); return p.attribs.find((a) => a.name === name)?.location ?? -1; }
  getUniformBlockIndex(): number { return 0xffffffff; }
  uniformBlockBinding(): void {}

  getUniformLocation(p: GlProgram, name: string): UniformLocation | null {
    this.settle(p);
    const sampler = p.samplerIndex.get(name);
    if (sampler !== undefined) return { program: p, slot: null, element: 0, sampler };
    let slot = p.uniforms.get(name);
    let element = 0;
    if (slot === undefined) {
      const m = /^(.*)\[(\d+)\]$/.exec(name);
      if (m !== null) { slot = p.uniforms.get(m[1]!); element = Number(m[2]); }
    }
    if (slot === undefined) return null;
    return { program: p, slot, element, sampler: -1 };
  }

  useProgram(p: GlProgram | null): void { if (p !== null) this.settle(p); this.program = p; }

  /** `uniform{1,2,3,4}{f,i,ui}`: one element written from its arguments, with no array made per call. */
  private writeScalars(loc: UniformLocation | null, components: number, integer: boolean, x: number, y: number, z: number, w: number): void {
    if (loc === null) return;
    const slot = loc.slot;
    if (slot === null || loc.sampler >= 0) { this.writeUniform(loc, [x, y, z, w].slice(0, components), components, integer); return; }
    if (loc.element >= slot.count) return;
    const p = loc.program;
    const view = slot.kind === "f" ? p.f32 : slot.kind === "u" ? p.u32 : p.i32;
    const base = (slot.offset + loc.element * (slot.stride === 0 ? 16 : slot.stride)) >> 2;
    const per = Math.min(components, slot.rows);
    const whole = integer || slot.kind !== "f";
    let changed = false;
    for (let k = 0; k < per; k += 1) {
      const raw = k === 0 ? x : k === 1 ? y : k === 2 ? z : w;
      const v = whole ? Math.trunc(raw) : Math.fround(raw);
      if (view[base + k] !== v) { view[base + k] = v; changed = true; }
    }
    if (changed) p.dirty = true;
  }

  private writeUniform(loc: UniformLocation | null, data: ArrayLike<number>, components: number, integer: boolean): void {
    if (loc === null) return;
    const p = loc.program;
    if (loc.sampler >= 0) {
      for (let k = 0; k < data.length && loc.sampler + k < p.units.length; k += 1) p.units[loc.sampler + k] = data[k]!;
      this.textureEpoch += 1;
      return;
    }
    const slot = loc.slot!;
    const view = slot.kind === "f" ? p.f32 : slot.kind === "u" ? p.u32 : p.i32;
    const rows = slot.rows;
    const stride = slot.stride === 0 ? 16 : slot.stride;
    const per = Math.min(components, rows);
    const count = Math.min(Math.floor(data.length / components), slot.count - loc.element);
    let changed = false;
    for (let e = 0; e < count; e += 1) {
      const base = (slot.offset + (loc.element + e) * stride) >> 2;
      for (let k = 0; k < per; k += 1) {
        // Rounded as the block stores it, so an unchanged value compares equal and leaves the block clean.
        const v = integer || slot.kind !== "f" ? Math.trunc(Number(data[e * components + k])) : Math.fround(Number(data[e * components + k]));
        if (view[base + k] !== v) { view[base + k] = v; changed = true; }
      }
    }
    if (changed) p.dirty = true;
  }

  private writeMatrix(loc: UniformLocation | null, data: ArrayLike<number>, columns: number, rows: number): void {
    if (loc === null || loc.slot === null) return;
    const p = loc.program;
    const slot = loc.slot;
    const per = columns * rows;
    const count = Math.min(Math.floor(data.length / per), slot.count - loc.element);
    const stride = slot.stride === 0 ? slot.column_stride * columns : slot.stride;
    let changed = false;
    for (let e = 0; e < count; e += 1) {
      for (let col = 0; col < columns; col += 1) {
        const base = (slot.offset + (loc.element + e) * stride + col * slot.column_stride) >> 2;
        for (let r = 0; r < rows; r += 1) {
          const v = data[e * per + col * rows + r]!;
          if (p.f32[base + r] !== v) { p.f32[base + r] = v; changed = true; }
        }
      }
    }
    if (changed) p.dirty = true;
  }

  uniform1f(l: UniformLocation | null, x: number): void { this.writeScalars(l, 1, false, x, 0, 0, 0); }
  uniform2f(l: UniformLocation | null, x: number, y: number): void { this.writeScalars(l, 2, false, x, y, 0, 0); }
  uniform3f(l: UniformLocation | null, x: number, y: number, z: number): void { this.writeScalars(l, 3, false, x, y, z, 0); }
  uniform4f(l: UniformLocation | null, x: number, y: number, z: number, w: number): void { this.writeScalars(l, 4, false, x, y, z, w); }
  uniform1i(l: UniformLocation | null, x: number): void { this.writeScalars(l, 1, true, x, 0, 0, 0); }
  uniform2i(l: UniformLocation | null, x: number, y: number): void { this.writeScalars(l, 2, true, x, y, 0, 0); }
  uniform3i(l: UniformLocation | null, x: number, y: number, z: number): void { this.writeScalars(l, 3, true, x, y, z, 0); }
  uniform4i(l: UniformLocation | null, x: number, y: number, z: number, w: number): void { this.writeScalars(l, 4, true, x, y, z, w); }
  uniform1ui(l: UniformLocation | null, x: number): void { this.writeScalars(l, 1, true, x, 0, 0, 0); }
  uniform2ui(l: UniformLocation | null, x: number, y: number): void { this.writeScalars(l, 2, true, x, y, 0, 0); }
  uniform3ui(l: UniformLocation | null, x: number, y: number, z: number): void { this.writeScalars(l, 3, true, x, y, z, 0); }
  uniform4ui(l: UniformLocation | null, x: number, y: number, z: number, w: number): void { this.writeScalars(l, 4, true, x, y, z, w); }
  uniform1fv(l: UniformLocation | null, v: ArrayLike<number>): void { this.writeUniform(l, v, 1, false); }
  uniform2fv(l: UniformLocation | null, v: ArrayLike<number>): void { this.writeUniform(l, v, 2, false); }
  uniform3fv(l: UniformLocation | null, v: ArrayLike<number>): void { this.writeUniform(l, v, 3, false); }
  uniform4fv(l: UniformLocation | null, v: ArrayLike<number>): void { this.writeUniform(l, v, 4, false); }
  uniform1iv(l: UniformLocation | null, v: ArrayLike<number>): void { this.writeUniform(l, v, 1, true); }
  uniform2iv(l: UniformLocation | null, v: ArrayLike<number>): void { this.writeUniform(l, v, 2, true); }
  uniform3iv(l: UniformLocation | null, v: ArrayLike<number>): void { this.writeUniform(l, v, 3, true); }
  uniform4iv(l: UniformLocation | null, v: ArrayLike<number>): void { this.writeUniform(l, v, 4, true); }
  uniform1uiv(l: UniformLocation | null, v: ArrayLike<number>): void { this.writeUniform(l, v, 1, true); }
  uniform2uiv(l: UniformLocation | null, v: ArrayLike<number>): void { this.writeUniform(l, v, 2, true); }
  uniform3uiv(l: UniformLocation | null, v: ArrayLike<number>): void { this.writeUniform(l, v, 3, true); }
  uniform4uiv(l: UniformLocation | null, v: ArrayLike<number>): void { this.writeUniform(l, v, 4, true); }
  uniformMatrix2fv(l: UniformLocation | null, _t: boolean, v: ArrayLike<number>): void { this.writeMatrix(l, v, 2, 2); }
  uniformMatrix3fv(l: UniformLocation | null, _t: boolean, v: ArrayLike<number>): void { this.writeMatrix(l, v, 3, 3); }
  uniformMatrix4fv(l: UniformLocation | null, _t: boolean, v: ArrayLike<number>): void { this.writeMatrix(l, v, 4, 4); }

  // ---------------------------------------------------------------- textures

  createTexture(): GlTexture {
    return { kind: "texture", id: nextId++, target: 0, gpu: null, format: null, width: 0, height: 0, depth: 1, levels: 1, immutable: false, wrap: [0x2901, 0x2901, 0x2901], minFilter: 0x2702, magFilter: 0x2601, compareMode: 0, compareFunc: 0x203, anisotropy: 1, baseLevel: 0, maxLevel: 1000, samplerKey: "", views: new Map(), usedBatch: 0, deleted: false, definedLevels: 0, revision: nextRevision++ };
  }
  deleteTexture(t: GlTexture | null): void { if (t === null) return; t.deleted = true; this.retire(t.gpu); t.gpu = null; t.views.clear(); t.revision = nextRevision++; this.textureEpoch += 1; }
  isTexture(t: unknown): boolean { return (t as GlTexture | null)?.kind === "texture"; }
  activeTexture(unit: number): void { this.activeUnit = unit - 0x84c0; }
  bindTexture(target: number, t: GlTexture | null): void {
    if (t !== null && t.target === 0) t.target = target;
    const unit = this.units[this.activeUnit]!;
    if (unit.get(target) !== t) { unit.set(target, t); this.textureEpoch += 1; }
  }
  private bound(target: number): GlTexture | null {
    const key = target >= 0x8515 && target <= 0x851a ? 0x8513 : target;
    return this.units[this.activeUnit]!.get(key) ?? null;
  }
  texParameteri(target: number, p: number, v: number): void {
    const t = this.bound(target);
    if (t === null) return;
    switch (p) {
      case 0x2802: t.wrap[0] = v; break;
      case 0x2803: t.wrap[1] = v; break;
      case 0x8072: t.wrap[2] = v; break;
      case 0x2801: t.minFilter = v; break;
      case 0x2800: t.magFilter = v; break;
      case 0x884c: t.compareMode = v; break;
      case 0x884d: t.compareFunc = v; break;
      case 0x813c: t.baseLevel = v; break;
      case 0x813d: t.maxLevel = v; break;
      case 0x84fe: t.anisotropy = v; break;
      default: return;
    }
    t.samplerKey = "";
    t.revision = nextRevision++;
    this.textureEpoch += 1;
  }
  texParameterf(target: number, p: number, v: number): void { this.texParameteri(target, p, v); }
  getTexParameter(): null { return null; }

  /** (Re)create `t`'s GPU texture for this size, format and level count, keeping it when they match. */
  private allocate(t: GlTexture, format: GlTextureFormat, width: number, height: number, depth: number, levels: number): void {
    // three passes log2(size) + 1 unrounded (10.58 for 768 wide); GL's GLsizei truncates it, and so
    // does WebGPU's mipLevelCount, so the count kept here must too or a level past the last passes
    // the completeness check.
    levels = Math.max(1, Math.trunc(levels));
    if (t.gpu !== null && t.format?.format === format.format && t.width === width && t.height === height && t.depth === depth && t.levels >= levels) return;
    if (t.gpu !== null && t.usedBatch === this.batch) this.orderFlush();
    this.retire(t.gpu);
    const cube = t.target === 0x8513;
    const three = t.target === 0x806f;
    const layers = cube ? 6 : depth;
    let usage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC;
    if (format.renderable) usage |= GPUTextureUsage.RENDER_ATTACHMENT;
    t.gpu = this.device.createTexture({ size: { width: Math.max(1, width), height: Math.max(1, height), depthOrArrayLayers: Math.max(1, layers) }, mipLevelCount: levels, dimension: three ? "3d" : "2d", format: format.format, usage });
    t.format = format;
    t.width = width;
    t.height = height;
    t.depth = depth;
    t.levels = levels;
    t.views.clear();
    t.revision = nextRevision++;
    this.textureEpoch += 1;
  }

  private levelsFor(t: GlTexture, w: number, h: number, d = 1): number {
    const [, , mips] = minFilter(t.minFilter);
    return mips ? mipCount(w, h, t.target === 0x806f ? d : 1) : 1;
  }

  texStorage2D(target: number, levels: number, internal: number, width: number, height: number): void {
    const t = this.bound(target);
    const format = glTextureFormat(internal);
    if (t === null || format === null) { this.warn(`texStorage2D: no WebGPU format for internal format 0x${internal.toString(16)}`); return; }
    this.allocate(t, format, width, height, 1, levels);
    t.immutable = true;
  }
  texStorage3D(target: number, levels: number, internal: number, width: number, height: number, depth: number): void {
    const t = this.bound(target);
    const format = glTextureFormat(internal);
    if (t === null || format === null) { this.warn(`texStorage3D: no WebGPU format for 0x${internal.toString(16)}`); return; }
    this.allocate(t, format, width, height, depth, levels);
    t.immutable = true;
  }

  texImage2D(target: number, level: number, internal: number, ...rest: any[]): void {
    const t = this.bound(target);
    if (t === null) return;
    let width: number, height: number, format: number, type: number, source: any, offset = 0;
    if (rest.length >= 6) {
      [width, height, , format, type, source, offset = 0] = rest;
    } else {
      [format, type, source] = rest;
      width = source?.videoWidth ?? source?.naturalWidth ?? source?.displayWidth ?? source?.width ?? 0;
      height = source?.videoHeight ?? source?.naturalHeight ?? source?.displayHeight ?? source?.height ?? 0;
    }
    const fmt = glTextureFormat(internal, format, type);
    if (fmt === null) { this.warn(`texImage2D: no WebGPU format for 0x${internal.toString(16)}/0x${format.toString(16)}/0x${type.toString(16)}`); return; }
    const face = target >= 0x8515 && target <= 0x851a ? target - 0x8515 : 0;
    if (level === 0 && !t.immutable) this.allocate(t, fmt, width, height, 1, Math.max(t.levels, this.levelsFor(t, width, height)));
    if (t.gpu === null || level >= t.levels) return;
    if (source !== null && source !== undefined) this.upload(t, level, 0, 0, face, width, height, 1, source, offset, type);
  }

  texSubImage2D(target: number, level: number, x: number, y: number, ...rest: any[]): void {
    const t = this.bound(target);
    if (t === null || t.gpu === null) return;
    let width: number, height: number, type: number, source: any, offset = 0;
    if (rest.length >= 5) [width, height, , type, source, offset = 0] = rest;
    else {
      [, type, source] = rest;
      width = source?.videoWidth ?? source?.naturalWidth ?? source?.displayWidth ?? source?.width ?? 0;
      height = source?.videoHeight ?? source?.naturalHeight ?? source?.displayHeight ?? source?.height ?? 0;
    }
    const face = target >= 0x8515 && target <= 0x851a ? target - 0x8515 : 0;
    this.upload(t, level, x, y, face, width, height, 1, source, offset, type);
  }

  texImage3D(target: number, level: number, internal: number, width: number, height: number, depth: number, _border: number, format: number, type: number, source: any, offset = 0): void {
    const t = this.bound(target);
    const fmt = glTextureFormat(internal, format, type);
    if (t === null || fmt === null) return;
    if (level === 0 && !t.immutable) this.allocate(t, fmt, width, height, depth, Math.max(t.levels, this.levelsFor(t, width, height, depth)));
    if (source !== null && source !== undefined && t.gpu !== null) this.upload(t, level, 0, 0, 0, width, height, depth, source, offset, type);
  }
  texSubImage3D(target: number, level: number, x: number, y: number, z: number, width: number, height: number, depth: number, _format: number, type: number, source: any, offset = 0): void {
    const t = this.bound(target);
    if (t === null || t.gpu === null) return;
    this.upload(t, level, x, y, z, width, height, depth, source, offset, type);
  }

  compressedTexImage2D(target: number, level: number, internal: number, width: number, height: number, _border: number, data: any, offset = 0, length = 0): void {
    const t = this.bound(target);
    const fmt = glTextureFormat(internal);
    if (t === null || fmt === null) { this.warn(`compressedTexImage2D: format 0x${internal.toString(16)} is not available`); return; }
    if (level === 0 && !t.immutable) this.allocate(t, fmt, width, height, 1, Math.max(t.levels, this.levelsFor(t, width, height)));
    const face = target >= 0x8515 && target <= 0x851a ? target - 0x8515 : 0;
    this.uploadCompressed(t, level, 0, 0, face, width, height, 1, data, offset, length);
  }
  compressedTexSubImage2D(target: number, level: number, x: number, y: number, width: number, height: number, _format: number, data: any, offset = 0, length = 0): void {
    const t = this.bound(target);
    if (t === null || t.gpu === null) return;
    const face = target >= 0x8515 && target <= 0x851a ? target - 0x8515 : 0;
    this.uploadCompressed(t, level, x, y, face, width, height, 1, data, offset, length);
  }
  compressedTexImage3D(target: number, level: number, internal: number, width: number, height: number, depth: number, _border: number, data: any, offset = 0, length = 0): void {
    const t = this.bound(target);
    const fmt = glTextureFormat(internal);
    if (t === null || fmt === null) return;
    if (level === 0 && !t.immutable) this.allocate(t, fmt, width, height, depth, Math.max(t.levels, this.levelsFor(t, width, height, depth)));
    this.uploadCompressed(t, level, 0, 0, 0, width, height, depth, data, offset, length);
  }
  compressedTexSubImage3D(target: number, level: number, x: number, y: number, z: number, width: number, height: number, depth: number, _format: number, data: any, offset = 0, length = 0): void {
    const t = this.bound(target);
    if (t === null || t.gpu === null) return;
    this.uploadCompressed(t, level, x, y, z, width, height, depth, data, offset, length);
  }

  private uploadCompressed(t: GlTexture, level: number, x: number, y: number, z: number, width: number, height: number, depth: number, data: any, offset: number, length: number): void {
    if (t.gpu === null || t.format === null || level >= t.levels) return;
    if (t.usedBatch === this.batch) this.orderFlush();
    const view = asView(data);
    const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, length > 0 ? length : view.byteLength - offset);
    const bw = Math.ceil(width / 4);
    const bh = Math.ceil(height / 4);
    const mipW = Math.max(1, t.width >> level);
    const mipH = Math.max(1, t.height >> level);
    // A level smaller than a block still copies whole blocks.
    const copyW = Math.min(bw * 4, Math.ceil(mipW / 4) * 4 - x);
    const copyH = Math.min(bh * 4, Math.ceil(mipH / 4) * 4 - y);
    this.queue.writeTexture({ texture: t.gpu, mipLevel: level, origin: { x, y, z } }, bytes, { bytesPerRow: bw * t.format.bytes, rowsPerImage: bh }, { width: copyW, height: copyH, depthOrArrayLayers: depth });
    t.definedLevels = Math.max(t.definedLevels, level + 1);
  }

  private upload(t: GlTexture, level: number, x: number, y: number, z: number, width: number, height: number, depth: number, source: any, offset: number, type: number): void {
    if (t.gpu === null || t.format === null || level >= t.levels || width === 0 || height === 0) return;
    if (t.usedBatch === this.batch) this.orderFlush();
    const flipY = this.pixelStore.get(0x9240) === true;
    const premultiply = this.pixelStore.get(0x9241) === true;
    if (ArrayBuffer.isView(source) || source instanceof ArrayBuffer) {
      const view = asView(source);
      const fmt = t.format;
      const element = (view as any).BYTES_PER_ELEMENT ?? 1;
      let bytes = new Uint8Array(view.buffer, view.byteOffset + offset * element, view.byteLength - offset * element);
      const sourceTexel = fmt.sourceBytes ?? (type === 0x8d61 || type === 0x140b ? fmt.bytes : fmt.bytes);
      const align = Number(this.pixelStore.get(0x0cf5) ?? 4);
      let rowBytes = Math.ceil((width * sourceTexel) / align) * align;
      if (fmt.widen !== undefined) {
        bytes = widenRows(bytes, width, height * depth, rowBytes, fmt.widen);
        rowBytes = width * fmt.bytes;
      }
      if (flipY) bytes = flipRows(bytes, rowBytes, height, depth);
      this.queue.writeTexture({ texture: t.gpu, mipLevel: level, origin: { x, y, z } }, bytes, { bytesPerRow: rowBytes, rowsPerImage: height }, { width, height, depthOrArrayLayers: depth });
    } else {
      try {
        this.queue.copyExternalImageToTexture({ source, flipY }, { texture: t.gpu, mipLevel: level, origin: { x, y, z }, premultipliedAlpha: premultiply, colorSpace: "srgb" }, { width, height });
      } catch (error) {
        this.warn(`texture upload from ${source?.constructor?.name ?? typeof source} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    t.definedLevels = Math.max(t.definedLevels, level + 1);
  }

  copyTexSubImage2D(target: number, level: number, x: number, y: number, sx: number, sy: number, width: number, height: number): void {
    const t = this.bound(target);
    const src = this.colorTexture(this.readFb, 0);
    if (t === null || t.gpu === null || src === null) { this.warn("copyTexSubImage2D from an unknown source"); return; }
    this.endPass();
    const face = target >= 0x8515 && target <= 0x851a ? target - 0x8515 : 0;
    this.ensureEncoder().copyTextureToTexture({ texture: src.texture, mipLevel: src.level, origin: { x: sx, y: sy, z: src.layer } }, { texture: t.gpu, mipLevel: level, origin: { x, y, z: face } }, { width, height });
    t.usedBatch = this.batch;
  }
  copyTexSubImage3D(target: number, level: number, x: number, y: number, z: number, sx: number, sy: number, width: number, height: number): void {
    const t = this.bound(target);
    const src = this.colorTexture(this.readFb, 0);
    if (t === null || t.gpu === null || src === null) return;
    this.endPass();
    this.ensureEncoder().copyTextureToTexture({ texture: src.texture, mipLevel: src.level, origin: { x: sx, y: sy, z: src.layer } }, { texture: t.gpu, mipLevel: level, origin: { x, y, z } }, { width, height });
    t.usedBatch = this.batch;
  }

  generateMipmap(target: number): void {
    const t = this.bound(target);
    if (t === null || t.gpu === null || t.format === null) return;
    if (t.levels <= 1) {
      // Allocated without mips (filter set after upload): reallocate with them and keep level 0.
      const old = t.gpu;
      const levels = mipCount(t.width, t.height);
      t.gpu = null;
      this.allocate(t, t.format, t.width, t.height, t.depth, levels);
      this.endPass();
      this.ensureEncoder().copyTextureToTexture({ texture: old }, { texture: t.gpu! }, { width: t.width, height: t.height, depthOrArrayLayers: t.target === 0x8513 ? 6 : t.depth });
      this.afterSubmit.push(() => old.destroy());
    }
    if (t.format.binding !== "float" || !t.format.renderable || t.target === 0x806f) return;
    this.endPass();
    const encoder = this.ensureEncoder();
    const pipeline = this.mipPipeline(t.format.format);
    this.mipSampler ??= this.device.createSampler({ minFilter: "linear", magFilter: "linear" });
    const layers = t.target === 0x8513 ? 6 : t.depth;
    for (let layer = 0; layer < layers; layer += 1) {
      for (let level = 1; level < t.levels; level += 1) {
        const src = t.gpu!.createView({ dimension: "2d", baseMipLevel: level - 1, mipLevelCount: 1, baseArrayLayer: layer, arrayLayerCount: 1 });
        const dst = t.gpu!.createView({ dimension: "2d", baseMipLevel: level, mipLevelCount: 1, baseArrayLayer: layer, arrayLayerCount: 1 });
        const group = this.device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: src }, { binding: 1, resource: this.mipSampler }] });
        const pass = encoder.beginRenderPass({ colorAttachments: [{ view: dst, loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 0] }] });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, group);
        pass.draw(3);
        pass.end();
      }
    }
    t.usedBatch = this.batch;
  }

  private mipPipeline(format: GPUTextureFormat): GPURenderPipeline {
    let p = this.mipPipelines.get(format);
    if (p === undefined) {
      const module = this.device.createShaderModule({ code: MIP_WGSL });
      p = this.device.createRenderPipeline({ layout: "auto", vertex: { module, entryPoint: "vs" }, fragment: { module, entryPoint: "fs", targets: [{ format }] }, primitive: { topology: "triangle-list" } });
      this.mipPipelines.set(format, p);
    }
    return p;
  }

  private samplerFor(t: GlTexture, binding: TextureBinding, comparison: boolean): GPUSampler {
    const [minF, mipF, usesMips] = minFilter(t.minFilter);
    const nearest = binding === "unfilterable" || binding === "uint" || binding === "sint" || (binding === "depth" && !comparison);
    const lin = (m: GPUFilterMode): GPUFilterMode => (nearest ? "nearest" : m);
    const mag = lin(t.magFilter === 0x2600 ? "nearest" : "linear");
    const min = lin(minF);
    const mips = usesMips && t.levels > 1;
    const mip: GPUMipmapFilterMode = mips && !nearest ? mipF : "nearest";
    const aniso = t.anisotropy > 1 && mag === "linear" && min === "linear" && mip === "linear" ? Math.min(16, Math.floor(t.anisotropy)) : 1;
    const key = `${t.wrap.join(",")}|${mag}${min}${mip}${mips ? 1 : 0}|${aniso}|${comparison ? t.compareFunc : 0}`;
    let s = this.samplers.get(key);
    if (s === undefined) {
      s = this.device.createSampler({
        addressModeU: addressMode(t.wrap[0]), addressModeV: addressMode(t.wrap[1]), addressModeW: addressMode(t.wrap[2]),
        magFilter: mag, minFilter: min, mipmapFilter: mip, lodMinClamp: 0, lodMaxClamp: mips ? 32 : 0, maxAnisotropy: aniso,
        ...(comparison ? { compare: compareFunction(t.compareFunc) } : {}),
      });
      this.samplers.set(key, s);
    }
    return s;
  }

  private textureView(t: GlTexture, dim: GPUTextureViewDimension, depthAspect: boolean): GPUTextureView {
    const key = `${dim}|${depthAspect}`;
    let v = t.views.get(key);
    if (v === undefined) {
      v = t.gpu!.createView({ dimension: dim, ...(depthAspect ? { aspect: "depth-only" as GPUTextureAspect } : {}), ...(t.levels > 1 ? { baseMipLevel: Math.min(t.baseLevel, t.levels - 1), mipLevelCount: Math.max(1, Math.min(t.levels, t.maxLevel + 1) - Math.min(t.baseLevel, t.levels - 1)) } : {}) });
      t.views.set(key, v);
    }
    return v;
  }

  // ---------------------------------------------------------------- framebuffers

  createFramebuffer(): GlFramebuffer { return { kind: "framebuffer", id: nextId++, colors: [], depth: null, stencil: null, drawBuffers: [0x8ce0], version: 1, plan: null }; }
  deleteFramebuffer(fb: GlFramebuffer | null): void { if (fb !== null && this.drawFb === fb) this.drawFb = null; }
  isFramebuffer(fb: unknown): boolean { return (fb as GlFramebuffer | null)?.kind === "framebuffer"; }
  bindFramebuffer(target: number, fb: GlFramebuffer | null): void {
    if (target === 0x8d40 || target === 0x8ca9) this.drawFb = fb;
    if (target === 0x8d40 || target === 0x8ca8) this.readFb = fb;
  }
  checkFramebufferStatus(target: number): number { return this.incompleteness(this.fbFor(target))?.status ?? 0x8cd5; }

  /**
   * Why GL would call `fb` incomplete, or null when it is complete (the default framebuffer always is).
   * GL draws and clears nothing into an incomplete framebuffer; WebGPU instead rejects a view of a
   * mip level the texture does not have, which invalidates the whole command buffer it was encoded in
   * (Deepward attached level 10 of a 10-level 768x256 texture and lost every draw batched with it).
   */
  private incompleteness(fb: GlFramebuffer | null): { status: number; reason: string } | null {
    if (fb === null) return null;
    // Checked at every pass, so without building a list of the attachments.
    let attached = 0;
    for (let i = -2; i < fb.colors.length; i += 1) {
      const a = i === -2 ? fb.depth : i === -1 ? fb.stencil : fb.colors[i];
      if (a == null) continue;
      attached += 1;
      if (a.object.kind !== "texture") continue;
      const t = a.object;
      if (t.gpu === null) return { status: 0x8cd6, reason: "a texture attached to it has no storage yet" };
      if (a.level >= t.levels) return { status: 0x8cd6, reason: `it attaches mip level ${a.level} of a ${t.width}x${t.height} texture that has ${t.levels}` };
    }
    return attached === 0 ? { status: 0x8cd7, reason: "nothing is attached" } : null;
  }
  private fbFor(target: number): GlFramebuffer | null { return target === 0x8ca8 ? this.readFb : this.drawFb; }
  private attach(fb: GlFramebuffer | null, point: number, a: Attachment | null): void {
    if (fb === null) return;
    if (point >= 0x8ce0 && point <= 0x8cef) fb.colors[point - 0x8ce0] = a;
    else if (point === 0x8d00) fb.depth = a;
    else if (point === 0x8d20) fb.stencil = a;
    else if (point === 0x821a) { fb.depth = a; fb.stencil = a; }
    fb.version += 1;
  }
  framebufferTexture2D(target: number, point: number, texTarget: number, t: GlTexture | null, level: number): void {
    this.attach(this.fbFor(target), point, t === null ? null : { object: t, level, layer: texTarget >= 0x8515 && texTarget <= 0x851a ? texTarget - 0x8515 : 0 });
  }
  framebufferTextureLayer(target: number, point: number, t: GlTexture | null, level: number, layer: number): void {
    this.attach(this.fbFor(target), point, t === null ? null : { object: t, level, layer });
  }
  framebufferRenderbuffer(target: number, point: number, _rbTarget: number, rb: GlRenderbuffer | null): void {
    this.attach(this.fbFor(target), point, rb === null ? null : { object: rb, level: 0, layer: 0 });
  }
  drawBuffers(buffers: number[]): void {
    if (this.drawFb === null) return;
    this.drawFb.drawBuffers = [...buffers];
    this.drawFb.version += 1;
  }
  readBuffer(): void {}
  invalidateFramebuffer(): void {}
  createRenderbuffer(): GlRenderbuffer { return { kind: "renderbuffer", id: nextId++, gpu: null, format: null, width: 0, height: 0, samples: 1, view: null }; }
  deleteRenderbuffer(rb: GlRenderbuffer | null): void { this.retire(rb?.gpu); }
  isRenderbuffer(rb: unknown): boolean { return (rb as GlRenderbuffer | null)?.kind === "renderbuffer"; }
  bindRenderbuffer(_target: number, rb: GlRenderbuffer | null): void { this.renderbuffer = rb; }
  renderbufferStorage(target: number, internal: number, width: number, height: number): void { this.renderbufferStorageMultisample(target, 0, internal, width, height); }
  renderbufferStorageMultisample(_target: number, samples: number, internal: number, width: number, height: number): void {
    const rb = this.renderbuffer;
    const fmt = glTextureFormat(internal);
    if (rb === null || fmt === null) { this.warn(`renderbuffer format 0x${internal.toString(16)} is not available`); return; }
    this.retire(rb.gpu);
    rb.samples = samples > 1 ? 4 : 1;
    // A multisampled depth buffer is also bound as a texture: a depth blit resolves it in a shader.
    const binding = rb.samples === 1 ? GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING : isDepthFormat(fmt.format) ? GPUTextureUsage.TEXTURE_BINDING : 0;
    rb.gpu = this.device.createTexture({ size: { width: Math.max(1, width), height: Math.max(1, height) }, format: fmt.format, sampleCount: rb.samples, usage: GPUTextureUsage.RENDER_ATTACHMENT | binding });
    rb.view = rb.gpu.createView();
    rb.format = fmt;
    rb.width = width;
    rb.height = height;
  }
  getRenderbufferParameter(): number { return 0; }
  getFramebufferAttachmentParameter(): number { return 0; }

  /** The single-sample color texture behind a framebuffer's attachment (the default framebuffer's back buffer). */
  private colorTexture(fb: GlFramebuffer | null, index: number): { texture: GPUTexture; level: number; layer: number } | null {
    if (fb === null) { this.ensureBackBuffer(); return { texture: this.backColor!, level: 0, layer: 0 }; }
    const a = fb.colors[index];
    if (a === undefined || a === null) return null;
    if (a.object.kind === "texture") return a.object.gpu === null ? null : { texture: a.object.gpu, level: a.level, layer: a.layer };
    return a.object.gpu === null ? null : { texture: a.object.gpu, level: 0, layer: 0 };
  }

  blitFramebuffer(sx0: number, sy0: number, sx1: number, sy1: number, dx0: number, dy0: number, dx1: number, dy1: number, mask: number): void {
    const src = this.readFb;
    const dst = this.drawFb;
    const incomplete = this.incompleteness(src) ?? this.incompleteness(dst);
    if (incomplete !== null) { this.warn(`a blit from or into an incomplete framebuffer is skipped, as GL skips it: ${incomplete.reason}`); return; }
    this.endPass();
    const encoder = this.ensureEncoder();
    const sameSize = sx1 - sx0 === dx1 - dx0 && sy1 - sy0 === dy1 - dy0;
    if ((mask & 0x4000) !== 0) {
      const from = src === null ? null : src.colors[0];
      const to = this.colorTexture(dst, 0);
      if (from !== null && from !== undefined && to !== null && from.object.gpu !== null) {
        const fromTexture = from.object.gpu;
        if (fromTexture.sampleCount > 1) {
          // MSAA resolve: an empty pass that resolves the multisampled color into the target.
          const view = to.texture.createView({ dimension: "2d", baseMipLevel: to.level, mipLevelCount: 1, baseArrayLayer: to.layer, arrayLayerCount: 1 });
          const pass = encoder.beginRenderPass({ colorAttachments: [{ view: fromTexture.createView(), resolveTarget: view, loadOp: "load", storeOp: "store" }] });
          pass.end();
        } else if (sameSize) {
          encoder.copyTextureToTexture({ texture: fromTexture, mipLevel: from.level, origin: { x: sx0, y: sy0, z: from.layer } }, { texture: to.texture, mipLevel: to.level, origin: { x: dx0, y: dy0, z: to.layer } }, { width: sx1 - sx0, height: sy1 - sy0 });
        } else this.warn("scaled blitFramebuffer is not drawn");
        if (dst !== null) for (const a of dst.colors) if (a?.object.kind === "texture") a.object.usedBatch = this.batch;
      }
    }
    if ((mask & 0x0100) !== 0 && src?.depth != null && src.depth.object.gpu !== null) {
      const to = dst === null ? this.backDepth : dst.depth?.object.gpu ?? null;
      const from = src.depth.object.gpu;
      if (to !== null && from.sampleCount === to.sampleCount && sameSize) encoder.copyTextureToTexture({ texture: from, origin: { x: sx0, y: sy0 } }, { texture: to, origin: { x: dx0, y: dy0 } }, { width: sx1 - sx0, height: sy1 - sy0 });
      else if (to !== null && from.sampleCount > 1 && to.sampleCount === 1 && sameSize) {
        this.resolveDepth(encoder, from, to, sx0, sy0, dx0, dy0, sx1 - sx0, sy1 - sy0);
        if (dst?.depth?.object.kind === "texture") dst.depth.object.usedBatch = this.batch;
      }
      else this.warn("depth blitFramebuffer between different sizes, or into a multisampled target, is not drawn");
    }
  }

  private readonly depthResolvePipelines = new Map<GPUTextureFormat, GPURenderPipeline>();

  /**
   * A multisampled depth blitted into a single-sample one (Scrap Signal's MSAA scene into the depth
   * texture its effects read): WebGPU resolves only color, so a pass writes each pixel's sample 0 as
   * its depth, the sample ANGLE's WebGL resolve takes.
   */
  private resolveDepth(encoder: GPUCommandEncoder, from: GPUTexture, to: GPUTexture, sx: number, sy: number, dx: number, dy: number, width: number, height: number): void {
    const format = to.format;
    let pipeline = this.depthResolvePipelines.get(format);
    if (pipeline === undefined) {
      const module = this.device.createShaderModule({ code: `@group(0) @binding(0) var src: texture_depth_multisampled_2d;
struct U { shift: vec2<i32> };
@group(0) @binding(1) var<uniform> u: U;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
  let p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  return vec4(p[i], 0.0, 1.0);
}
@fragment fn fs(@builtin(position) at: vec4<f32>) -> @builtin(frag_depth) f32 { return textureLoad(src, vec2<i32>(at.xy) + u.shift, 0); }` });
      pipeline = this.device.createRenderPipeline({
        layout: "auto",
        vertex: { module, entryPoint: "vs" },
        fragment: { module, entryPoint: "fs", targets: [] },
        primitive: { topology: "triangle-list" },
        depthStencil: { format, depthWriteEnabled: true, depthCompare: "always" },
      });
      this.depthResolvePipelines.set(format, pipeline);
    }
    const shift = this.device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.queue.writeBuffer(shift, 0, new Int32Array([sx - dx, sy - dy, 0, 0]));
    this.retire(shift);
    const group = this.device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: from.createView({ aspect: "depth-only" }) }, { binding: 1, resource: { buffer: shift } }] });
    const stencil = hasStencil(format);
    const pass = encoder.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: to.createView(), depthLoadOp: "load", depthStoreOp: "store", ...(stencil ? { stencilLoadOp: "load" as const, stencilStoreOp: "store" as const } : {}) } });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, group);
    pass.setViewport(dx, dy, width, height, 0, 1);
    pass.setScissorRect(dx, dy, width, height);
    pass.draw(3);
    pass.end();
  }

  /**
   * Into a bound pixel-pack buffer: copy on the GPU now, map after the frame is submitted, and fill
   * the buffer's CPU copy for `getBufferSubData`. Into client memory WebGPU cannot answer
   * synchronously; that read is reported and leaves the destination unchanged.
   */
  readPixels(x: number, y: number, width: number, height: number, _format: number, _type: number, dst: any): void {
    const pack = this.pixelPack;
    if (pack === null || typeof dst !== "number") { this.warn("readPixels into client memory has no synchronous WebGPU equivalent; the destination is left unchanged"); return; }
    const incomplete = this.incompleteness(this.readFb);
    if (incomplete !== null) { this.warn(`readPixels from an incomplete framebuffer is not read, as in GL: ${incomplete.reason}`); return; }
    const src = this.readFb === null ? null : this.readFb.colors[0] ?? null;
    const texture = src === null ? null : src.object.gpu;
    if (src === null || texture === null || src.object.format === null || texture.sampleCount > 1) { this.warn("readPixels from the default or a multisampled framebuffer is not read"); return; }
    const texel = src.object.format.bytes;
    const rowBytes = width * texel;
    const padded = Math.ceil(rowBytes / 256) * 256;
    const staging = this.device.createBuffer({ size: padded * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    this.endPass();
    this.ensureEncoder().copyTextureToBuffer({ texture, mipLevel: src.level, origin: { x, y, z: src.layer } }, { buffer: staging, bytesPerRow: padded, rowsPerImage: height }, { width, height });
    const offset = dst;
    // Joins the fence list now: a fence made right after this call (the GL pattern) covers it,
    // though the map can only start once the batch is submitted.
    let landed!: () => void;
    this.readsSinceFence.push(new Promise<void>((resolve) => { landed = resolve; }));
    this.afterSubmit.push(() => {
      const mapStarted = performance.now();
      void staging.mapAsync(GPUMapMode.READ).then(() => {
        this.stats.reads += 1;
        this.stats.readMs += performance.now() - mapStarted;
        const bytes = new Uint8Array(staging.getMappedRange());
        if (pack.data === null || pack.data.byteLength < offset + rowBytes * height) pack.data = new Uint8Array(Math.max(pack.size, offset + rowBytes * height));
        const whole = new Uint8Array(pack.data.buffer, pack.data.byteOffset, pack.data.byteLength);
        for (let r = 0; r < height; r += 1) whole.set(bytes.subarray(r * padded, r * padded + rowBytes), offset + r * rowBytes);
        staging.unmap();
        staging.destroy();
      }, (error: unknown) => {
        this.warn(`degraded: a pixel readback failed, its buffer keeps its old contents: ${error instanceof Error ? error.message : String(error)}`);
        staging.destroy();
      }).finally(landed);
    });
  }

  private readsSinceFence: Promise<void>[] = [];

  /**
   * Signals once the commands before it are submitted and every readback queued before it has
   * landed: the only GPU results a page can observe. It does not wait for the queue to drain
   * (`onSubmittedWorkDone`): Chrome answers that late, 3.8 s per fence on average while the
   * shader warmup waited on one per batch of programs.
   */
  fenceSync(): { kind: "sync"; signaled: boolean } {
    const sync = { kind: "sync" as const, signaled: false };
    this.ensureEncoder();
    // The readbacks queued since the last fence; an earlier fence already covers older ones.
    const reads = this.readsSinceFence;
    this.readsSinceFence = [];
    this.afterSubmit.push(() => {
      const started = performance.now();
      const signal = (): void => {
        sync.signaled = true;
        this.stats.fences += 1;
        this.stats.fenceMs += performance.now() - started;
      };
      if (reads.length === 0) signal();
      else void Promise.all(reads).then(signal, signal);
    });
    return sync;
  }
  clientWaitSync(sync: { signaled: boolean }): number { return sync.signaled ? 0x911a : 0x911b; }
  getSyncParameter(sync: { signaled: boolean }, p: number): number { return p === 0x9114 ? (sync.signaled ? 0x9119 : 0x9118) : 0; }
  deleteSync(): void {}

  createQuery(): GlQuery { return { kind: "query", id: nextId++, result: 0, available: true, start: -1, end: -1, ended: true, startNs: null, endNs: null, endNsSerial: -1 }; }
  deleteQuery(q: GlQuery | null): void {
    if (q === null) return;
    this.timedPending.delete(q);
    if (this.timedQuery === q) this.timedQuery = null;
  }
  /**
   * A TIME_ELAPSED query times the render passes it overlaps, whole, from the first one's start to the
   * last one's end (GPU time, not the gaps between passes). Once a page uses timers, every pass writes
   * its stamps, so starting or stopping a timer never ends a pass: a split would add a store and a load
   * of the target that WebGL never pays, and the timers would slow the frame they measure. A timer
   * started and stopped inside one pass reads that whole pass. Other query kinds answer 0 at once.
   */
  beginQuery(target: number, q: GlQuery): void {
    if (target !== 0x88bf || this.stamps === null) return;
    this.timersInUse = true;
    // Only the first timer can find an unstamped pass open; it starts with the next pass.
    if (this.pass !== null && this.openPassStamp < 0) this.endPass("any");
    q.result = 0;
    q.available = false;
    q.start = -1;
    q.end = -1;
    q.ended = false;
    q.startNs = null;
    q.endNs = null;
    q.endNsSerial = -1;
    if (this.openPassStamp >= 0) {
      q.start = this.openPassStamp;
      q.end = this.openPassStamp + 1;
    }
    this.timedQuery = q;
    this.timedPending.add(q);
  }
  endQuery(target: number): void {
    const q = this.timedQuery;
    if (target !== 0x88bf || q === null) return;
    this.timedQuery = null;
    q.ended = true;
    this.settleTimer(q);
  }
  getQueryParameter(q: GlQuery, p: number): number | boolean { return p === 0x8867 ? q.available : q.result; }

  /** Answer a timer query whose stamps have all come back: its last pass's end minus its first pass's start. */
  private settleTimer(q: GlQuery): void {
    if (!q.ended || q.available) return;
    if (q.start < 0) {
      q.result = 0;
    } else {
      if (q.startNs === null || q.endNs === null || q.endNsSerial !== q.end) return;
      q.result = Math.max(0, q.endNs - q.startNs);
    }
    q.available = true;
    this.timedPending.delete(q);
  }

  /** The timestamp writes for a pass about to begin, once the page uses timers. */
  private passStamps(): GPURenderPassTimestampWrites | undefined {
    this.openPassStamp = -1;
    if (!this.timersInUse || this.stamps === null) return undefined;
    if (this.stampSerial - this.stampFirst + 2 > STAMPS_PER_BATCH) {
      if (!this.stampOverflowed) this.warn(`degraded: a batch ran over ${STAMPS_PER_BATCH / 2} timed passes; the GPU timer leaves out the passes after it`);
      this.stampOverflowed = true;
      return undefined;
    }
    const begin = this.stampSerial;
    this.stampSerial += 2;
    this.openPassStamp = begin;
    const q = this.timedQuery;
    if (q !== null) {
      if (q.start < 0) q.start = begin;
      q.end = begin + 1;
    }
    return { querySet: this.stamps, beginningOfPassWriteIndex: begin - this.stampFirst, endOfPassWriteIndex: begin + 1 - this.stampFirst };
  }

  /** Resolve the batch's stamps into a readback, and hand them to the timer queries waiting on them once the GPU is done. */
  private resolveStamps(encoder: GPUCommandEncoder): void {
    const first = this.stampFirst;
    const count = this.stampSerial - first;
    this.stampFirst = this.stampSerial;
    if (count === 0 || this.stamps === null || this.stampResolve === null) return;
    encoder.resolveQuerySet(this.stamps, 0, count, this.stampResolve, 0);
    const read = this.device.createBuffer({ size: count * 8, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    encoder.copyBufferToBuffer(this.stampResolve, 0, read, 0, count * 8);
    this.afterSubmit.push(() => {
      void read.mapAsync(GPUMapMode.READ).then(() => {
        const ns = new BigUint64Array(read.getMappedRange());
        for (const q of this.timedPending) {
          if (q.start >= first && q.start < first + count) q.startNs = Number(ns[q.start - first]!);
          if (q.end >= first && q.end < first + count) { q.endNs = Number(ns[q.end - first]!); q.endNsSerial = q.end; }
          this.settleTimer(q);
        }
        read.unmap();
        read.destroy();
      }, (error: unknown) => {
        this.warn(`degraded: GPU timestamps did not read back: ${error instanceof Error ? error.message : String(error)}`);
        read.destroy();
      });
    });
  }

  // ---------------------------------------------------------------- passes

  private ensureEncoder(): GPUCommandEncoder {
    if (this.encoder === null) {
      this.encoder = this.device.createCommandEncoder();
      if (!this.presentScheduled) {
        this.presentScheduled = true;
        queueMicrotask(() => this.present());
      }
    }
    return this.encoder;
  }

  private ensureBackBuffer(): void {
    const w = Math.max(1, this.canvas.width);
    const h = Math.max(1, this.canvas.height);
    if (this.backColor !== null && this.backSize[0] === w && this.backSize[1] === h) return;
    this.retire(this.backColor);
    this.retire(this.backColorMsaa);
    this.retire(this.backDepth);
    this.backColor = this.device.createTexture({ size: { width: w, height: h }, format: "rgba8unorm", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST });
    const samples = this.attributes.antialias ? 4 : 1;
    this.backColorMsaa = samples > 1 ? this.device.createTexture({ size: { width: w, height: h }, format: "rgba8unorm", sampleCount: samples, usage: GPUTextureUsage.RENDER_ATTACHMENT }) : null;
    this.backDepth = this.attributes.depth || this.attributes.stencil ? this.device.createTexture({ size: { width: w, height: h }, format: this.attributes.stencil ? "depth24plus-stencil8" : "depth24plus", sampleCount: samples, usage: GPUTextureUsage.RENDER_ATTACHMENT }) : null;
    this.backSize = [w, h];
    // Made once per size: a view per pass was two native calls and garbage every pass.
    this.backViews = { color: this.backColor.createView(), msaa: this.backColorMsaa?.createView() ?? null, depth: this.backDepth?.createView() ?? null };
    this.presentGroup = null;
  }

  private attachmentView(a: Attachment): GPUTextureView | null {
    if (a.object.kind === "renderbuffer") return a.object.view;
    const t = a.object;
    if (t.gpu === null) return null;
    const key = `rt|${a.level}|${a.layer}`;
    let v = t.views.get(key);
    if (v === undefined) {
      v = t.gpu.createView({ dimension: "2d", baseMipLevel: a.level, mipLevelCount: 1, baseArrayLayer: a.layer, arrayLayerCount: 1 });
      t.views.set(key, v);
    }
    return v;
  }

  /** Make sure a render pass is open on the current draw framebuffer, applying any pending clear. */
  private openPass(): boolean {
    const fb = this.drawFb;
    const version = fb === null ? -1 : fb.version;
    if (this.pass !== null && this.passTarget !== null && this.passTarget.fb === fb && this.passTarget.version === version && (fb !== null || (this.backSize[0] === this.canvas.width && this.backSize[1] === this.canvas.height))) {
      return true;
    }
    this.endPass(fb);
    const clear = this.pendingClear !== null && this.pendingClear.fb === fb ? this.pendingClear : null;
    this.pendingClear = null;
    return this.beginPass(fb, clear);
  }

  /**
   * What a pass on `fb` attaches, built once per framebuffer change (or back-buffer size) rather
   * than at each of a frame's ~30 passes. Its attachments carry load ops and no clear values: the
   * browser converts every member of a pass descriptor at each beginRenderPass, so a pass that only
   * loads costs least with nothing more in it. Null for an incomplete framebuffer, rechecked each pass.
   */
  private passPlan(fb: GlFramebuffer | null): PassPlan | null {
    if (fb === null) {
      this.ensureBackBuffer();
      const views = this.backViews!;
      if (this.backPlan !== null && this.backPlan.deps[0] === views) return this.backPlan;
      const color: GPURenderPassColorAttachment = { view: views.msaa ?? views.color, loadOp: "load", storeOp: "store" };
      if (views.msaa !== null) color.resolveTarget = views.color;
      const depthFormat = this.backDepth?.format ?? null;
      const depth = depthFormat === null ? undefined : loadDepth(views.depth!, depthFormat);
      const samples = views.msaa !== null ? 4 : 1;
      this.backPlan = this.makePlan(null, [views], [color], [0], ["rgba8unorm"], depth, depthFormat, this.backSize[0]!, this.backSize[1]!, samples, []);
      return this.backPlan;
    }
    const known = fb.plan;
    if (known !== null && known.target.version === fb.version && sameDeps(fb, known.deps)) return known;
    fb.plan = null;
    const incomplete = this.incompleteness(fb);
    if (incomplete !== null) {
      this.warn(`a draw or clear into an incomplete framebuffer is skipped, as GL skips it: ${incomplete.reason}`);
      return null;
    }
    const colors: (GPURenderPassColorAttachment | null)[] = [];
    const colorIndex: number[] = [];
    const colorFormats: (GPUTextureFormat | null)[] = [];
    const textures: GlTexture[] = [];
    let depth: GPURenderPassDepthStencilAttachment | undefined;
    let depthFormat: GPUTextureFormat | null = null;
    let width = 0;
    let height = 0;
    let samples = 1;
    for (const buffer of fb.drawBuffers) {
      const index = buffer - 0x8ce0;
      const a = buffer === 0 ? null : fb.colors[index];
      const view = a == null ? null : this.attachmentView(a);
      if (a == null || view === null) { colors.push(null); colorIndex.push(-1); colorFormats.push(null); continue; }
      const object = a.object;
      colors.push({ view, loadOp: "load", storeOp: "store" });
      colorIndex.push(index);
      colorFormats.push(object.format!.format);
      width = Math.max(1, (object.kind === "texture" ? object.width >> a.level : object.width));
      height = Math.max(1, (object.kind === "texture" ? object.height >> a.level : object.height));
      samples = object.kind === "renderbuffer" ? object.samples : 1;
      if (object.kind === "texture") textures.push(object);
    }
    const d = fb.depth ?? fb.stencil;
    if (d !== null) {
      const view = this.attachmentView(d);
      if (view !== null) {
        depthFormat = d.object.format!.format;
        depth = loadDepth(view, depthFormat);
        if (width === 0) {
          width = Math.max(1, d.object.kind === "texture" ? d.object.width >> d.level : d.object.width);
          height = Math.max(1, d.object.kind === "texture" ? d.object.height >> d.level : d.object.height);
          samples = d.object.kind === "renderbuffer" ? d.object.samples : 1;
        }
        if (d.object.kind === "texture") textures.push(d.object);
      }
    }
    while (colors.length > 0 && colors[colors.length - 1] === null) { colors.pop(); colorIndex.pop(); colorFormats.pop(); }
    if (colors.length === 0 && depth === undefined) { this.warn("a draw into a framebuffer whose draw buffers name nothing attached"); return null; }
    fb.plan = this.makePlan(fb, attachmentDeps(fb), colors, colorIndex, colorFormats, depth, depthFormat, width, height, samples, textures);
    return fb.plan;
  }

  private makePlan(fb: GlFramebuffer | null, deps: unknown[], colors: (GPURenderPassColorAttachment | null)[], colorIndex: number[], colorFormats: (GPUTextureFormat | null)[], depth: GPURenderPassDepthStencilAttachment | undefined, depthFormat: GPUTextureFormat | null, width: number, height: number, samples: number, textures: GlTexture[]): PassPlan {
    const key = `${colorFormats.join(",")}|${depthFormat}|${samples}`;
    const descriptor: GPURenderPassDescriptor = depth === undefined ? { colorAttachments: colors } : { colorAttachments: colors, depthStencilAttachment: depth };
    return { deps, colorIndex, descriptor, textures, target: { fb, version: fb === null ? -1 : fb.version, width, height, colorFormats, depthFormat, samples, key, id: internId(this.targetIds, key) } };
  }

  /** Open a render pass on `fb`, with `clear`'s values as load ops. */
  private beginPass(fb: GlFramebuffer | null, clear: PendingClear | null): boolean {
    const plan = this.passPlan(fb);
    if (plan === null) return false;
    const encoder = this.ensureEncoder();
    if (fb === null) {
      this.backDirty = true;
      if (this.backColorMsaa !== null && clear?.color[0] == null) this.warn("the default framebuffer reloads its multisampled color between passes");
    }
    for (let i = 0; i < plan.textures.length; i += 1) plan.textures[i]!.usedBatch = this.batch;
    let descriptor = plan.descriptor;
    if (clear !== null) descriptor = withClears(descriptor, plan.colorIndex, clear);
    const timestampWrites = this.passStamps();
    if (timestampWrites !== undefined) descriptor = { ...descriptor, timestampWrites };
    this.pass = encoder.beginRenderPass(descriptor);
    this.stats.passes += 1;
    this.passTarget = plan.target;
    this.boundPipeline = null;
    this.boundGroup1 = null;
    this.boundUniform = -1;
    this.boundVertex = [];
    this.boundVertexOffset = [];
    this.boundIndex = null;
    this.boundIndexFormat = null;
    this.boundView = undefined;
    this.boundScissor = undefined;
    this.boundRef = -1;
    this.boundBlend = undefined;
    return true;
  }

  /**
   * End the open pass, then run any pending clear nobody drew after (GL's order: the clear happened),
   * unless it is for `keep`, the target about to be opened. `keep` of `"any"` holds every pending
   * clear for the next pass's load op: a pass boundary that changes no target (a GPU timer starting
   * or stopping) then costs no clear-only pass of its own.
   */
  private endPass(keep?: GlFramebuffer | null | "any"): void {
    if (this.pass !== null) {
      this.pass.end();
      this.pass = null;
      this.passTarget = null;
      this.openPassStamp = -1;
    }
    const pending = this.pendingClear;
    if (pending === null || keep === "any" || (keep !== undefined && pending.fb === keep)) return;
    this.pendingClear = null;
    if (this.beginPass(pending.fb, pending)) {
      this.pass!.end();
      this.pass = null;
      this.passTarget = null;
      this.openPassStamp = -1;
    }
  }

  clear(mask: number): void {
    const fb = this.drawFb;
    const scissored = this.enabled.has(0x0c11) && (this.scissorBox[0] !== 0 || this.scissorBox[1] !== 0 || this.scissorBox[2]! < this.drawingWidth(fb) || this.scissorBox[3]! < this.drawingHeight(fb));
    const colorMasked = (mask & 0x4000) !== 0 && !this.colorWrite.every(Boolean);
    const stencilMasked = (mask & 0x0400) !== 0 && (this.stencilFront.writeMask & 0xff) !== 0xff;
    // A load-op clear covers the whole target; a partial one is drawn as a triangle, as GL does it.
    if (scissored || colorMasked || stencilMasked) { this.clearQuad(mask); return; }
    // A pass already drawing into this target ends; the clear opens the next one.
    if (this.pass !== null && this.passTarget?.fb === fb) this.endPass();
    if (this.pendingClear !== null && this.pendingClear.fb !== fb) this.endPass();
    const pending = this.pendingClear ?? { fb, color: [], depth: null, stencil: null };
    if ((mask & 0x4000) !== 0) {
      const count = fb === null ? 1 : Math.max(1, fb.colors.length);
      for (let i = 0; i < count; i += 1) {
        const buffer = fb === null ? 0x8ce0 : fb.drawBuffers[i] ?? 0;
        if (fb !== null && buffer === 0) continue;
        pending.color[fb === null ? 0 : buffer - 0x8ce0] = { r: this.clearColorValue[0]!, g: this.clearColorValue[1]!, b: this.clearColorValue[2]!, a: this.clearColorValue[3]! };
      }
    }
    if ((mask & 0x0100) !== 0 && this.depthWrite) pending.depth = this.clearDepthValue;
    if ((mask & 0x0400) !== 0) pending.stencil = this.clearStencilValue;
    this.pendingClear = pending;
    this.ensureEncoder();
  }

  clearBufferfv(buffer: number, index: number, values: ArrayLike<number>): void {
    const fb = this.drawFb;
    if (this.pass !== null && this.passTarget?.fb === fb) this.endPass();
    const pending = this.pendingClear ?? { fb, color: [], depth: null, stencil: null };
    if (buffer === 0x1800) pending.color[index] = { r: values[0]!, g: values[1]!, b: values[2]!, a: values[3]! };
    else if (buffer === 0x1801) pending.depth = values[0]!;
    this.pendingClear = pending;
    this.ensureEncoder();
  }
  clearBufferiv(buffer: number, index: number, values: ArrayLike<number>): void { this.clearBufferfv(buffer, index, values); }
  clearBufferuiv(buffer: number, index: number, values: ArrayLike<number>): void { this.clearBufferfv(buffer, index, values); }
  clearBufferfi(_buffer: number, _index: number, depth: number, stencil: number): void {
    const fb = this.drawFb;
    if (this.pass !== null && this.passTarget?.fb === fb) this.endPass();
    const pending = this.pendingClear ?? { fb, color: [], depth: null, stencil: null };
    pending.depth = depth;
    pending.stencil = stencil;
    this.pendingClear = pending;
  }

  private readonly clearPipelines = new Map<string, GPURenderPipeline>();

  /** A clear limited by the scissor box or write masks: a full-target triangle writing the clear values. */
  private clearQuad(mask: number): void {
    if (!this.openPass()) return;
    const target = this.passTarget!;
    const color = (mask & 0x4000) !== 0;
    const depth = (mask & 0x0100) !== 0 && this.depthWrite && target.depthFormat !== null && target.depthFormat !== "stencil8";
    const stencil = (mask & 0x0400) !== 0 && target.depthFormat !== null && (hasStencil(target.depthFormat) || target.depthFormat === "stencil8");
    const writeMask = color ? (this.colorWrite[0] ? 1 : 0) | (this.colorWrite[1] ? 2 : 0) | (this.colorWrite[2] ? 4 : 0) | (this.colorWrite[3] ? 8 : 0) : 0;
    const stencilWrite = stencil ? this.stencilFront.writeMask & 0xff : 0;
    const key = `${target.key}|${writeMask}|${depth ? 1 : 0}|${stencilWrite}`;
    let pipeline = this.clearPipelines.get(key);
    if (pipeline === undefined) {
      const kind = (f: GPUTextureFormat): string => (f.includes("sint") ? "i32" : f.includes("uint") ? "u32" : "f32");
      const outputs = target.colorFormats.map((f, i) => (f === null ? "" : `@location(${i}) c${i}: vec4<${kind(f)}>,`)).join(" ");
      const values = target.colorFormats.map((f) => (f === null ? "" : `vec4<${kind(f)}>(u.color),`)).join(" ");
      const code = `struct U { color: vec4<f32>, depth: vec4<f32> };
@group(0) @binding(0) var<uniform> u: U;
struct O { ${outputs} };
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
  let p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  return vec4(p[i], u.depth.x, 1.0);
}
@fragment fn fs() -> O { return O(${values}); }`;
      const module = this.device.createShaderModule({ code });
      const targets = target.colorFormats.map((format) => (format === null ? null : { format, writeMask }));
      pipeline = this.device.createRenderPipeline({
        layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.uniformLayout] }),
        vertex: { module, entryPoint: "vs" },
        fragment: { module, entryPoint: "fs", targets },
        primitive: { topology: "triangle-list" },
        ...(target.depthFormat !== null ? { depthStencil: {
          format: target.depthFormat,
          depthWriteEnabled: depth,
          depthCompare: "always" as GPUCompareFunction,
          ...(stencil ? { stencilFront: { compare: "always" as GPUCompareFunction, passOp: "replace" as GPUStencilOperation }, stencilBack: { compare: "always" as GPUCompareFunction, passOp: "replace" as GPUStencilOperation }, stencilWriteMask: stencilWrite } : {}),
        } } : {}),
        multisample: { count: target.samples },
      });
      this.clearPipelines.set(key, pipeline);
    }
    let at = Math.ceil(this.stagingUsed / this.uniformAlign) * this.uniformAlign;
    if (at + 32 > this.staging.byteLength) { this.submit(); if (!this.openPass()) return; at = 0; }
    new Float32Array(this.staging.buffer, at, 8).set([...this.clearColorValue, this.clearDepthValue, 0, 0, 0]);
    this.stagingUsed = at + 32;
    const pass = this.pass!;
    pass.setPipeline(pipeline);
    this.dynamicOffset[0] = at;
    pass.setBindGroup(0, this.ringGroup(32), this.dynamicOffset, 0, 1);
    pass.setViewport(0, 0, target.width, target.height, 0, 1);
    const sc = this.enabled.has(0x0c11) ? this.scissorBox : [0, 0, target.width, target.height];
    const sx = Math.min(target.width, Math.max(0, sc[0]!));
    const sy = Math.min(target.height, Math.max(0, sc[1]!));
    pass.setScissorRect(sx, sy, Math.max(0, Math.min(sc[2]!, target.width - sx)), Math.max(0, Math.min(sc[3]!, target.height - sy)));
    if (stencil) pass.setStencilReference(this.clearStencilValue);
    pass.draw(3);
    this.boundPipeline = null;
    this.boundUniform = -1;
    this.boundView = undefined;
    this.boundScissor = undefined;
    this.boundRef = -1;
  }

  private drawingWidth(fb: GlFramebuffer | null): number {
    if (fb === null) return this.canvas.width;
    const a = fb.colors.find((x) => x != null) ?? fb.depth;
    if (a == null) return 0;
    return a.object.kind === "texture" ? Math.max(1, a.object.width >> a.level) : a.object.width;
  }
  private drawingHeight(fb: GlFramebuffer | null): number {
    if (fb === null) return this.canvas.height;
    const a = fb.colors.find((x) => x != null) ?? fb.depth;
    if (a == null) return 0;
    return a.object.kind === "texture" ? Math.max(1, a.object.height >> a.level) : a.object.height;
  }

  // ---------------------------------------------------------------- draws

  drawArrays(mode: number, first: number, count: number): void { this.draw(mode, first, count, 1, null, 0); }
  drawArraysInstanced(mode: number, first: number, count: number, instances: number): void { this.draw(mode, first, count, instances, null, 0); }
  drawElements(mode: number, count: number, type: number, offset: number): void { this.draw(mode, 0, count, 1, type, offset); }
  drawElementsInstanced(mode: number, count: number, type: number, offset: number, instances: number): void { this.draw(mode, 0, count, instances, type, offset); }
  drawRangeElements(mode: number, _start: number, _end: number, count: number, type: number, offset: number): void { this.draw(mode, 0, count, 1, type, offset); }

  /**
   * The pipeline state's interned id; computed once per state change, without allocating. A part
   * that is switched off (blend, depth test, cull, offset, stencil) records only that, as a string
   * key once did, so its leftover values do not split pipelines.
   */
  private stateId(): number {
    if (this.stateKeyVersion === this.stateVersion) return this.stateKeyId;
    const f = this.stateFields;
    const e = this.enabled;
    const blend = e.has(0x0be2);
    f[0] = blend ? 1 : 0;
    f[1] = blend ? this.blendEq[0]! : 0;
    f[2] = blend ? this.blendEq[1]! : 0;
    for (let i = 0; i < 4; i += 1) f[3 + i] = blend ? this.blendFn[i]! : 0;
    const depth = e.has(0x0b71);
    f[7] = depth ? 1 : 0;
    f[8] = depth ? this.depthFn : 0;
    f[9] = depth && this.depthWrite ? 1 : 0;
    f[10] = e.has(0x0b44) ? this.cull : 0;
    f[11] = this.front;
    const off = e.has(0x8037);
    f[12] = off ? 1 : 0;
    f[13] = off ? this.offset[0]! : 0;
    f[14] = off ? this.offset[1]! : 0;
    const stencil = e.has(0x0b90);
    f[15] = stencil ? 1 : 0;
    const s = this.stencilFront;
    const b = this.stencilBack;
    f[16] = stencil ? s.func : 0; f[17] = stencil ? s.mask : 0; f[18] = stencil ? s.fail : 0; f[19] = stencil ? s.zfail : 0; f[20] = stencil ? s.zpass : 0; f[21] = stencil ? s.writeMask : 0;
    f[22] = stencil ? b.func : 0; f[23] = stencil ? b.mask : 0; f[24] = stencil ? b.fail : 0; f[25] = stencil ? b.zfail : 0; f[26] = stencil ? b.zpass : 0; f[27] = stencil ? b.writeMask : 0;
    f[28] = (this.colorWrite[0] ? 1 : 0) | (this.colorWrite[1] ? 2 : 0) | (this.colorWrite[2] ? 4 : 0) | (this.colorWrite[3] ? 8 : 0);
    let hash = 0x811c9dc5;
    for (let i = 0; i < STATE_FIELDS; i += 1) hash = Math.imul(hash ^ (Math.round(f[i]! * 4096) | 0), 0x01000193);
    let bucket = this.stateTable.get(hash);
    let id = 0;
    if (bucket !== undefined) {
      for (let k = 0; k < bucket.length && id === 0; k += 1) {
        const held = bucket[k]!.fields;
        let same = true;
        for (let i = 0; i < STATE_FIELDS && same; i += 1) same = held[i] === f[i];
        if (same) id = bucket[k]!.id;
      }
    }
    if (id === 0) {
      id = ++this.stateCount;
      if (bucket === undefined) { bucket = []; this.stateTable.set(hash, bucket); }
      bucket.push({ fields: f.slice(), id });
    }
    this.stateKeyId = id;
    this.stateKeyVersion = this.stateVersion;
    return id;
  }

  private vertexPlan(p: GlProgram): VertexPlan | null {
    const vao = this.vao;
    const known = p.vertexCache.get(vao);
    if (known !== undefined && known.version === vao.version) {
      const cached = known.plan;
      let ready = true;
      for (let i = 0; i < cached.slots.length; i += 1) { const b = cached.slots[i]!.buffer; if (b !== null && b.gpu === null) { ready = false; break; } }
      if (ready) return cached.slots.length > this.maxVertexBuffers ? null : cached;
    }
    const inputs = p.translated!.layout.vertex_inputs;
    const slots: VertexSlot[] = [];
    const constants: number[] = [];
    const constantAttrs: GPUVertexAttribute[] = [];
    let keyParts = "";
    const limits: (InstancedAttribute & { buffer: GlBuffer })[] = [];
    let drawIdLocation = -1;
    for (const input of inputs) {
      if (input.name === DRAW_ID_INPUT) { drawIdLocation = input.location; continue; }
      const a = vao.attribs[input.location];
      if (a === undefined || !a.enabled || a.buffer === null) {
        constants.push(input.location);
        const kind = input.kind;
        constantAttrs.push({ shaderLocation: input.location, offset: constantAttrs.length * 16, format: kind === "f" ? "float32x4" : kind === "i" ? "sint32x4" : "uint32x4" });
        continue;
      }
      const elementBytes = componentBytes(a.type);
      const stride = a.stride === 0 ? a.size * elementBytes : a.stride;
      const step: GPUVertexStepMode = a.divisor > 0 ? "instance" : "vertex";
      let format = vertexFormat(a.type, a.size, a.normalized, a.integer, input.kind);
      let convert: VertexSlot["convert"] = null;
      let offset = a.offset;
      let slotStride = stride;
      if (format === null) {
        // Read as GL reads it: a Float32 copy of just this attribute.
        format = (`float32${a.size === 1 ? "" : `x${a.size}`}`) as GPUVertexFormat;
        convert = { type: a.type, size: a.size, normalized: a.normalized };
        slotStride = a.size * 4;
        offset = 0;
      }
      // Share a slot with an earlier attribute from the same buffer, stride and step (an interleaved buffer, a matrix's columns).
      let slot = convert === null ? slots.find((s) => s.convert === null && !s.constant && s.buffer === a.buffer && s.stride === slotStride && s.step === step && offset >= s.offset && offset - s.offset + 16 <= slotStride + 16) : undefined;
      if (slot !== undefined && offset - slot.offset + formatBytes(format) > slotStride) slot = undefined;
      if (slot === undefined) {
        slot = { buffer: a.buffer, offset: convert === null ? offset - (offset % 4) : 0, stride: slotStride, step, attributes: [], convert: convert === null ? null : { ...convert, offset: a.offset, stride } as any, constant: false, sources: [], packed: null };
        slots.push(slot);
      }
      slot.attributes.push({ shaderLocation: input.location, offset: convert === null ? offset - slot.offset : 0, format });
      slot.sources.push({ buffer: a.buffer, offset: a.offset, stride, type: a.type, size: a.size, normalized: a.normalized, convert: convert !== null, location: input.location, format });
      // Measured on the GL layout (the source buffer), whether or not this attribute reads a Float32 copy.
      if (a.divisor > 0) limits.push({ stride, offset: a.offset, bytes: a.size * elementBytes, buffer: a.buffer, divisor: a.divisor, size: 0 });
    }
    if (constantAttrs.length > 0) slots.push({ buffer: null, offset: 0, stride: 0, step: "instance", attributes: constantAttrs, convert: null, constant: true, sources: [], packed: null });
    // More buffers than WebGPU binds: interleave the per-vertex ones (static geometry, packed once),
    // then if still over, the per-instance ones, into one buffer each.
    const max = this.maxVertexBuffers;
    for (const step of ["vertex", "instance"] as const) {
      if (slots.length <= max) break;
      const group = slots.filter((x) => !x.constant && x.step === step);
      if (group.length < 2) continue;
      const sources = group.flatMap((x) => x.sources);
      const attributes: GPUVertexAttribute[] = [];
      let at = 0;
      for (const src of sources) {
        attributes.push({ shaderLocation: src.location, offset: at, format: src.format });
        at += Math.ceil(formatBytes(src.format) / 4) * 4;
      }
      const packedSlot: VertexSlot = { buffer: null, offset: 0, stride: at, step, attributes, convert: null, constant: false, sources, packed: { gpu: null, ids: [], versions: [] } };
      const kept = slots.filter((x) => !group.includes(x));
      slots.length = 0;
      slots.push(packedSlot, ...kept);
    }
    if (drawIdLocation >= 0) slots.push({ buffer: this.drawIds(1), offset: 0, stride: 4, step: "instance", attributes: [{ shaderLocation: drawIdLocation, offset: 0, format: "sint32" }], convert: null, constant: false, sources: [], packed: null });
    for (const s of slots) keyParts += `${s.stride}${s.step[0]}:${s.attributes.map((x) => `${x.shaderLocation}@${x.offset}${x.format}`).join(",")};`;
    const plan: VertexPlan = {
      id: internId(this.layoutIds, keyParts),
      key: keyParts,
      slots,
      constants,
      // Sizes read at each draw (a buffer can be re-sized under a cached plan), in place: a copy per draw was most of the context's garbage.
      instanceCapacity: (instances: number) => {
        for (const l of limits) l.size = l.buffer.data?.byteLength ?? l.buffer.size;
        return instancesThatFit(instances, limits);
      },
      perInstance: limits.length > 0,
    };
    if (slots.length > max) this.warn(`a draw needs ${slots.length} vertex buffers, over WebGPU's ${max}; it is not drawn`);
    p.vertexCache.set(vao, { version: vao.version, plan });
    return slots.length > max ? null : plan;
  }

  private pipelineFor(p: GlProgram, plan: VertexPlan, mode: number, indexType: number | null, texsig: string): GPURenderPipeline | null {
    const target = this.passTarget!;
    const topo = topology(mode);
    if (topo === null) { this.warn(`draw mode ${mode} (LINE_LOOP / TRIANGLE_FAN) is not drawn`); return null; }
    const key = `${p.id}|${plan.key}|s${this.stateId()}|${target.key}|${topo}|${texsig}${topo.endsWith("strip") ? indexType : ""}`;
    let pipeline = this.pipelines.get(key);
    if (pipeline !== undefined) return pipeline;
    const e = this.enabled;
    const blendOn = e.has(0x0be2);
    const comp = (op: number, src: number, dst: number): GPUBlendComponent => {
      const operation = blendOperation(op);
      return operation === "min" || operation === "max" ? { operation, srcFactor: "one", dstFactor: "one" } : { operation, srcFactor: blendFactor(src), dstFactor: blendFactor(dst) };
    };
    const writeMask = (this.colorWrite[0] ? 1 : 0) | (this.colorWrite[1] ? 2 : 0) | (this.colorWrite[2] ? 4 : 0) | (this.colorWrite[3] ? 8 : 0);
    const outputs = p.translated!.layout.fragment_outputs;
    const targets: (GPUColorTargetState | null)[] = target.colorFormats.map((format, i) => {
      if (format === null) return null;
      if (i >= Math.max(1, outputs)) return { format, writeMask: 0 };
      const blendable = !format.includes("int") && (this.float32Blendable || !format.includes("32float"));
      return { format, writeMask, ...(blendOn && blendable ? { blend: { color: comp(this.blendEq[0]!, this.blendFn[0]!, this.blendFn[1]!), alpha: comp(this.blendEq[1]!, this.blendFn[2]!, this.blendFn[3]!) } } : {}) };
    });
    let depthStencil: GPUDepthStencilState | undefined;
    if (target.depthFormat !== null) {
      const depthTest = e.has(0x0b71);
      const stencilOn = e.has(0x0b90) && hasStencil(target.depthFormat);
      const face = (s: typeof this.stencilFront): GPUStencilFaceState => ({ compare: compareFunction(s.func), failOp: stencilOperation(s.fail), depthFailOp: stencilOperation(s.zfail), passOp: stencilOperation(s.zpass) });
      const triangles = topo === "triangle-list" || topo === "triangle-strip";
      const bias = e.has(0x8037) && triangles ? { depthBias: Math.round(this.offset[1]!), depthBiasSlopeScale: this.offset[0]!, depthBiasClamp: 0 } : {};
      depthStencil = {
        format: target.depthFormat,
        depthWriteEnabled: depthTest && this.depthWrite,
        depthCompare: depthTest ? compareFunction(this.depthFn) : "always",
        ...(stencilOn ? { stencilFront: face(this.stencilFront), stencilBack: face(this.stencilBack), stencilReadMask: this.stencilFront.mask, stencilWriteMask: this.stencilFront.writeMask } : {}),
        ...bias,
      };
    }
    const cullOn = e.has(0x0b44);
    const layout = this.programLayout(p, texsig);
    const buffers: GPUVertexBufferLayout[] = plan.slots.map((s) => ({ arrayStride: s.stride, stepMode: s.step, attributes: s.attributes }));
    try {
      pipeline = this.device.createRenderPipeline({
        layout: layout.pipeline,
        vertex: { module: p.vertex!, entryPoint: "main", buffers },
        fragment: { module: p.fragment!, entryPoint: "main", targets },
        primitive: {
          topology: topo,
          ...(topo.endsWith("strip") && indexType !== null ? { stripIndexFormat: indexType === 0x1405 ? "uint32" : "uint16" } : {}),
          frontFace: this.front === 0x0900 ? "ccw" : "cw",
          cullMode: !cullOn ? "none" : this.cull === 0x0404 ? "front" : this.cull === 0x0405 ? "back" : "none",
        },
        ...(depthStencil !== undefined ? { depthStencil } : {}),
        multisample: { count: target.samples },
      });
    } catch (error) {
      this.warn(`a pipeline did not build: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
    this.pipelines.set(key, pipeline);
    this.stats.pipelines += 1;
    return pipeline;
  }

  private programLayout(p: GlProgram, texsig: string): { group: GPUBindGroupLayout; pipeline: GPUPipelineLayout } {
    let layout = p.layouts.get(texsig);
    if (layout !== undefined) return layout;
    const entries: GPUBindGroupLayoutEntry[] = [];
    const slots = p.translated!.layout.samplers;
    slots.forEach((s, i) => {
      const bind = texsig[i] as string;
      const sampleType: GPUTextureSampleType = bind === "d" ? "depth" : bind === "u" ? "unfilterable-float" : bind === "I" ? "sint" : bind === "U" ? "uint" : "float";
      const comparison = s.kind === "Depth";
      entries.push({ binding: s.texture_binding, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, texture: { sampleType: comparison ? "depth" : sampleType === "depth" ? "unfilterable-float" : sampleType, viewDimension: viewDimension(s.dim) } });
      entries.push({ binding: s.sampler_binding, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, sampler: { type: comparison ? "comparison" : sampleType === "float" ? "filtering" : "non-filtering" } });
    });
    const group = entries.length === 0 ? this.emptyLayout : this.device.createBindGroupLayout({ entries });
    layout = { group, pipeline: this.device.createPipelineLayout({ bindGroupLayouts: [this.uniformLayout, group] }) };
    p.layouts.set(texsig, layout);
    return layout;
  }

  /** The texture bound to each of the program's sampler slots, and the layout signature they make. */
  private textures(p: GlProgram): { sig: string; list: (GlTexture | null)[] } {
    const slots = p.translated!.layout.samplers;
    let sig = "";
    const list: (GlTexture | null)[] = [];
    for (let i = 0; i < slots.length; i += 1) {
      const s = slots[i]!;
      const unit = p.units[i]!;
      const t = this.units[unit]?.get(dimTarget(s.dim)) ?? null;
      const usable = t !== null && t.gpu !== null && t.format !== null && !t.deleted;
      list.push(usable ? t : null);
      if (!usable) { sig += s.kind === "Depth" ? "d" : s.kind === "Sint" ? "I" : s.kind === "Uint" ? "U" : "f"; continue; }
      const b = textureBinding(t.format!, this.float32Filterable);
      sig += b === "depth" ? "d" : b === "unfilterable" ? "u" : b === "sint" ? "I" : b === "uint" ? "U" : "f";
    }
    return { sig, list };
  }

  /**
   * The texture set the program's samplers resolve to now. Found by a hash of each slot's texture
   * and revision and checked slot by slot, so a draw that switches between materials allocates
   * nothing; only a combination not seen before builds its signature and bind group.
   */
  private textureSetFor(p: GlProgram): TextureSet {
    const slots = p.translated!.layout.samplers;
    let hash = slots.length;
    for (let i = 0; i < slots.length; i += 1) {
      const t = this.units[p.units[i]!]?.get(dimTarget(slots[i]!.dim)) ?? null;
      hash = (Math.imul(hash, 0x01000193) ^ (t === null ? 0 : t.revision)) | 0;
    }
    const bucket = p.textureSets.get(hash);
    if (bucket !== undefined) {
      for (let k = 0; k < bucket.length; k += 1) {
        const set = bucket[k]!;
        let same = true;
        for (let i = 0; i < slots.length && same; i += 1) {
          const t = this.units[p.units[i]!]?.get(dimTarget(slots[i]!.dim)) ?? null;
          same = set.bound[i] === t && (t === null || set.revisions[i] === t.revision);
        }
        if (same) return set;
      }
    }
    const bound: (GlTexture | null)[] = [];
    const revisions: number[] = [];
    for (let i = 0; i < slots.length; i += 1) {
      const t = this.units[p.units[i]!]?.get(dimTarget(slots[i]!.dim)) ?? null;
      bound.push(t);
      revisions.push(t === null ? 0 : t.revision);
    }
    const { sig, list } = this.textures(p);
    const set: TextureSet = { epoch: 0, bound, revisions, list, sig, sigId: internId(this.sigIds, sig), group: this.bindGroupFor(p, sig, list) };
    let sets = 0;
    for (const held of p.textureSets.values()) sets += held.length;
    if (sets >= MAX_TEXTURE_SETS) p.textureSets.clear();
    const into = p.textureSets.get(hash);
    if (into === undefined) p.textureSets.set(hash, [set]);
    else into.push(set);
    return set;
  }

  private bindGroupFor(p: GlProgram, sig: string, list: (GlTexture | null)[]): GPUBindGroup {
    const slots = p.translated!.layout.samplers;
    if (slots.length === 0) return this.emptyGroup;
    let key = `${p.id}|${sig}`;
    for (let i = 0; i < list.length; i += 1) {
      const t = list[i];
      if (t === null || t === undefined) { key += "|-"; continue; }
      if (t.samplerKey === "") t.samplerKey = `${t.wrap.join(",")},${t.minFilter},${t.magFilter},${t.compareMode},${t.compareFunc},${t.anisotropy},${t.baseLevel},${t.maxLevel}`;
      key += `|${t.id}.${t.gpu === null ? 0 : (t.gpu as any).__jgSerial ??= nextId++}.${t.samplerKey}`;
    }
    let group = this.bindGroups.get(key);
    if (group !== undefined) return group;
    const layout = this.programLayout(p, sig);
    const entries: GPUBindGroupEntry[] = [];
    slots.forEach((s, i) => {
      const bind = sig[i];
      const comparison = s.kind === "Depth";
      const t = list[i] ?? null;
      const dim = viewDimension(s.dim);
      let view: GPUTextureView;
      let sampler: GPUSampler;
      if (t === null) {
        view = this.dummyView(dim, bind === "d" || comparison ? "depth" : bind === "I" ? "sint" : bind === "U" ? "uint" : bind === "u" ? "unfilterable" : "float");
        sampler = this.samplers.get(comparison ? "dummy-cmp" : "dummy") ?? this.device.createSampler(comparison ? { compare: "less-equal" } : {});
        this.samplers.set(comparison ? "dummy-cmp" : "dummy", sampler);
      } else {
        const binding: TextureBinding = bind === "d" ? "depth" : bind === "u" ? "unfilterable" : bind === "I" ? "sint" : bind === "U" ? "uint" : "float";
        view = this.textureView(t, dim, isDepthFormat(t.format!.format));
        sampler = this.samplerFor(t, binding, comparison);
        t.usedBatch = this.batch;
      }
      entries.push({ binding: s.texture_binding, resource: view });
      entries.push({ binding: s.sampler_binding, resource: sampler });
    });
    group = this.device.createBindGroup({ layout: layout.group, entries });
    this.bindGroups.set(key, group);
    this.stats.bindGroups += 1;
    return group;
  }

  private readonly dummies = new Map<string, GPUTextureView>();
  private dummyView(dim: GPUTextureViewDimension, binding: TextureBinding): GPUTextureView {
    const key = `${dim}|${binding}`;
    let v = this.dummies.get(key);
    if (v === undefined) {
      const format: GPUTextureFormat = binding === "depth" ? "depth32float" : binding === "sint" ? "r32sint" : binding === "uint" ? "r32uint" : binding === "unfilterable" ? "r32float" : "rgba8unorm";
      const layers = dim === "cube" ? 6 : 1;
      const t = this.device.createTexture({ size: { width: 1, height: 1, depthOrArrayLayers: layers }, dimension: dim === "3d" ? "3d" : "2d", format, usage: GPUTextureUsage.TEXTURE_BINDING | (binding === "depth" ? GPUTextureUsage.RENDER_ATTACHMENT : GPUTextureUsage.COPY_DST) });
      v = t.createView({ dimension: dim });
      this.dummies.set(key, v);
    }
    return v;
  }

  private ringGroup(size: number): GPUBindGroup {
    let g = this.ringGroups.get(size);
    if (g === undefined) {
      g = this.device.createBindGroup({ layout: this.uniformLayout, entries: [{ binding: 0, resource: { buffer: this.ring, offset: 0, size } }] });
      this.ringGroups.set(size, g);
    }
    return g;
  }

  /** Interleave a packed slot's sources into one buffer, rebuilt when any source changes. */
  private packedCopy(slot: VertexSlot): GPUBuffer | null {
    const packed = slot.packed!;
    const sources = slot.sources;
    // Compared number by number: a string of the versions per draw was most of its garbage.
    let current = packed.gpu !== null && packed.ids.length === sources.length;
    for (let k = 0; k < sources.length; k += 1) {
      const b = sources[k]!.buffer;
      if (b.data === null) return null;
      b.usedBatch = this.batch;
      if (current && (packed.ids[k] !== b.id || packed.versions[k] !== b.version)) current = false;
    }
    if (current) return packed.gpu;
    let count = Infinity;
    for (const src of slot.sources) {
      const bytes = src.size * componentBytes(src.type);
      const length = src.buffer.data!.byteLength;
      count = Math.min(count, length < src.offset + bytes ? 0 : Math.floor((length - src.offset - bytes) / src.stride) + 1);
    }
    const out = new Uint8Array(Math.max(4, count * slot.stride));
    const view = new DataView(out.buffer);
    slot.sources.forEach((src, k) => {
      const at = slot.attributes[k]!.offset;
      const data = src.buffer.data!;
      const from = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      const fromView = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const element = componentBytes(src.type);
      for (let i = 0; i < count; i += 1) {
        const base = src.offset + i * src.stride;
        if (!src.convert) out.set(from.subarray(base, base + src.size * element), i * slot.stride + at);
        else for (let c = 0; c < src.size; c += 1) view.setFloat32(i * slot.stride + at + c * 4, readComponent(fromView, base + c * element, src.type, src.normalized), true);
      }
    });
    if (packed.gpu === null || packed.gpu.size < out.byteLength) {
      this.retire(packed.gpu);
      packed.gpu = this.device.createBuffer({ size: out.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    }
    // A source changing submitted the batch first (its upload saw it in use), so this write lands in order.
    this.queue.writeBuffer(packed.gpu, 0, out);
    packed.ids.length = sources.length;
    packed.versions.length = sources.length;
    for (let k = 0; k < sources.length; k += 1) { packed.ids[k] = sources[k]!.buffer.id; packed.versions[k] = sources[k]!.buffer.version; }
    return packed.gpu;
  }

  private floatCopy(b: GlBuffer, c2: { type: number; size: number; normalized: boolean; offset: number; stride: number }): GPUBuffer | null {
    if (b.data === null) return null;
    const key = `${c2.type},${c2.size},${c2.normalized},${c2.offset},${c2.stride}`;
    b.floatCopies ??= new Map();
    const known = b.floatCopies.get(key);
    if (known !== undefined && known.version === b.version) return known.gpu;
    const src = new DataView(b.data.buffer, b.data.byteOffset, b.data.byteLength);
    const element = componentBytes(c2.type);
    const count = Math.max(0, Math.floor((b.data.byteLength - c2.offset - c2.size * element) / c2.stride) + 1);
    const out = new Float32Array(Math.max(1, count * c2.size));
    for (let i = 0; i < count; i += 1) {
      for (let k = 0; k < c2.size; k += 1) out[i * c2.size + k] = readComponent(src, c2.offset + i * c2.stride + k * element, c2.type, c2.normalized);
    }
    let gpu = known?.gpu;
    if (gpu === undefined || gpu.size < out.byteLength) {
      this.retire(gpu);
      gpu = this.device.createBuffer({ size: Math.max(4, out.byteLength), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    }
    this.queue.writeBuffer(gpu, 0, out);
    b.floatCopies.set(key, { version: b.version, gpu });
    return gpu;
  }

  private draw(mode: number, first: number, count: number, instances: number, indexType: number | null, offset: number, multi: MultiDraw | null = null): void {
    const p = this.program;
    if (p === null || !p.linked || count <= 0 || instances <= 0) return;
    if (multi !== null && multi.drawCount <= 0) return;
    if (!this.openPass()) return;
    // Grown before the plan's slots are bound, so the draw ids cover every item.
    if (multi !== null) this.drawIds(multi.drawCount);
    const plan = this.vertexPlan(p);
    if (multi !== null && plan?.perInstance === true) this.warn("degraded: a multi-draw program also reads per-instance attributes; each item's draw id offsets them");
    // Room for this draw's constant attributes, before any of its state is set on the pass.
    if (plan !== null && plan.constants.length > 0 && this.constantsUsed + plan.constants.length * 4 > this.constants.length) {
      this.submit();
      if (!this.openPass()) return;
    }
    if (plan === null) return;
    const fit = plan.perInstance ? plan.instanceCapacity(instances) : instances;
    if (fit < instances) {
      this.warn(`a draw asked for ${instances} instances but its instance buffers hold ${fit}; drawing ${fit} (WebGL draws the rest with zero attributes, which shows nothing)`);
      instances = fit;
      if (instances === 0) return;
    }
    let tc = p.lastTextures;
    if (tc === null || tc.epoch !== this.textureEpoch) {
      tc = this.textureSetFor(p);
      tc.epoch = this.textureEpoch;
      p.lastTextures = tc;
    }
    const sig = tc.sig;
    // Marks the batch's textures, so an upload to one of them submits this batch first (GL order).
    for (let i = 0; i < tc.list.length; i += 1) { const t = tc.list[i]; if (t != null) t.usedBatch = this.batch; }
    const target = this.passTarget!;
    const stateId = this.stateId();
    const index = indexType ?? 0;
    const pipelineHash = (Math.imul((Math.imul((Math.imul((Math.imul(plan.id, 31) + stateId) | 0, 31) + target.id) | 0, 31) + tc.sigId) | 0, 31) + mode * 0x10000 + index) | 0;
    let pipeline: GPURenderPipeline | null = null;
    const pipelineBucket = p.pipelineSets.get(pipelineHash);
    if (pipelineBucket !== undefined) {
      for (let k = 0; k < pipelineBucket.length; k += 1) {
        const e = pipelineBucket[k]!;
        if (e.layoutId === plan.id && e.stateId === stateId && e.targetId === target.id && e.mode === mode && e.indexType === indexType && e.sigId === tc.sigId) { pipeline = e.pipeline; break; }
      }
    }
    if (pipeline === null) {
      pipeline = this.pipelineFor(p, plan, mode, indexType, sig);
      if (pipeline === null) return;
      const entry: PipelineEntry = { layoutId: plan.id, stateId, targetId: target.id, mode, indexType, sigId: tc.sigId, pipeline };
      if (pipelineBucket === undefined) p.pipelineSets.set(pipelineHash, [entry]);
      else pipelineBucket.push(entry);
    }
    const pass = this.pass!;
    // Uniforms: one aligned copy per program per change.
    if (p.dirty || p.slotBatch !== this.batch) {
      let at = Math.ceil(this.stagingUsed / this.uniformAlign) * this.uniformAlign;
      if (at + p.blockSize > this.staging.byteLength) {
        this.submit();
        if (!this.openPass()) return;
        at = 0;
      }
      // The block is exactly blockSize long once linked, so most draws copy it without making a view.
      this.staging.set(p.bytes.byteLength === p.blockSize ? p.bytes : p.bytes.subarray(0, p.blockSize), at);
      this.stagingUsed = at + p.blockSize;
      p.slotOffset = at;
      p.slotBatch = this.batch;
      p.dirty = false;
    }
    const passNow = this.pass!;
    if (this.boundPipeline !== pipeline) { passNow.setPipeline(pipeline); this.boundPipeline = pipeline; }
    if (this.boundUniform !== p.slotOffset + p.blockSize * 1e7) {
      this.dynamicOffset[0] = p.slotOffset;
      passNow.setBindGroup(0, this.ringGroup(p.blockSize), this.dynamicOffset, 0, 1);
      this.boundUniform = p.slotOffset + p.blockSize * 1e7;
    }
    const group = tc.group;
    if (this.boundGroup1 !== group) { passNow.setBindGroup(1, group); this.boundGroup1 = group; }
    void pass;
    for (let i = 0; i < plan.slots.length; i += 1) {
      const s = plan.slots[i]!;
      let buffer: GPUBuffer | null;
      let at = 0;
      if (s.constant) {
        const need = plan.constants.length * 4;
        if (this.constantsUsed + need > this.constants.length) { this.warn("constant vertex attributes overflowed their buffer"); return; }
        at = this.constantsUsed * 4;
        for (let k = 0; k < plan.constants.length; k += 1) this.constants.set(this.generic[plan.constants[k]!]!, this.constantsUsed + k * 4);
        this.constantsUsed += need;
        buffer = this.constantRing;
      } else if (s.packed !== null) {
        buffer = this.packedCopy(s);
      } else if (s.convert !== null) {
        buffer = this.floatCopy(s.buffer!, s.convert as any);
        s.buffer!.usedBatch = this.batch;
      } else {
        buffer = s.buffer!.gpu;
        at = s.offset;
        s.buffer!.usedBatch = this.batch;
      }
      if (buffer === null) return;
      if (this.boundVertex[i] !== buffer || this.boundVertexOffset[i] !== at) {
        passNow.setVertexBuffer(i, buffer, at);
        this.boundVertex[i] = buffer;
        this.boundVertexOffset[i] = at;
      }
    }
    const view = this.viewportBox;
    if (view !== this.boundView) {
      const x = Math.max(0, view[0]!);
      const y = Math.max(0, view[1]!);
      passNow.setViewport(x, y, Math.max(1, Math.min(view[2]!, target.width - x)), Math.max(1, Math.min(view[3]!, target.height - y)), 0, 1);
      this.boundView = view;
    }
    const scissor = this.enabled.has(0x0c11) ? this.scissorBox : null;
    if (scissor !== this.boundScissor) {
      const sc = scissor ?? [0, 0, target.width, target.height];
      const x = Math.min(target.width, Math.max(0, sc[0]!));
      const y = Math.min(target.height, Math.max(0, sc[1]!));
      passNow.setScissorRect(x, y, Math.max(0, Math.min(sc[2]!, target.width - x)), Math.max(0, Math.min(sc[3]!, target.height - y)));
      this.boundScissor = scissor;
    }
    if (this.enabled.has(0x0b90) && this.boundRef !== this.stencilFront.ref) { passNow.setStencilReference(this.stencilFront.ref); this.boundRef = this.stencilFront.ref; }
    if (this.enabled.has(0x0be2) && this.blendColorValue !== this.boundBlend) {
      passNow.setBlendConstant(this.blendColorValue as [number, number, number, number]);
      this.boundBlend = this.blendColorValue;
    }
    if (indexType !== null) {
      const elements = this.vao.elements;
      if (elements === null || elements.gpu === null) return;
      elements.usedBatch = this.batch;
      let gpu = elements.gpu;
      let format: GPUIndexFormat = indexType === 0x1405 ? "uint32" : "uint16";
      let firstIndex = offset / (indexType === 0x1405 ? 4 : indexType === 0x1403 ? 2 : 1);
      if (indexType === 0x1401) {
        gpu = this.floatCopyIndex(elements);
        format = "uint16";
        firstIndex = offset;
      }
      if (this.boundIndex !== gpu || this.boundIndexFormat !== format) { passNow.setIndexBuffer(gpu, format); this.boundIndex = gpu; this.boundIndexFormat = format; }
      if (multi === null) passNow.drawIndexed(count, instances, firstIndex, 0, 0);
      else {
        const bytes = indexType === 0x1405 ? 4 : indexType === 0x1403 ? 2 : 1;
        for (let i = 0; i < multi.drawCount; i += 1) {
          const n = multi.counts[multi.countsOffset + i] ?? 0;
          if (n > 0) passNow.drawIndexed(n, 1, (multi.starts[multi.startsOffset + i] ?? 0) / bytes, 0, i);
        }
      }
    } else if (multi === null) {
      passNow.draw(count, instances, first, 0);
    } else {
      for (let i = 0; i < multi.drawCount; i += 1) {
        const n = multi.counts[multi.countsOffset + i] ?? 0;
        if (n > 0) passNow.draw(n, 1, multi.starts[multi.startsOffset + i] ?? 0, i);
      }
    }
    this.stats.draws += 1;
  }

  private drawIdBuffer: GlBuffer | null = null;

  /** The buffer holding 0, 1, 2... that multi-draw items read their `gl_DrawID` from, grown to hold `count`. */
  private drawIds(count: number): GlBuffer {
    const b = (this.drawIdBuffer ??= this.createBuffer());
    if (b.gpu !== null && b.size >= count * 4) return b;
    const length = Math.max(1024, 2 ** Math.ceil(Math.log2(count)));
    const ids = new Int32Array(length);
    for (let i = 0; i < length; i += 1) ids[i] = i;
    // The old buffer's ids are a prefix of the new one's, so draws already recorded with it stay right.
    this.retire(b.gpu);
    b.gpu = this.device.createBuffer({ size: ids.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.queue.writeBuffer(b.gpu, 0, ids);
    b.size = ids.byteLength;
    b.data = ids;
    b.version += 1;
    return b;
  }

  private floatCopyIndex(b: GlBuffer): GPUBuffer {
    b.floatCopies ??= new Map();
    const known = b.floatCopies.get("u8index");
    if (known !== undefined && known.version === b.version) return known.gpu;
    const src = b.data === null ? new Uint8Array(0) : new Uint8Array(b.data.buffer, b.data.byteOffset, b.data.byteLength);
    const out = new Uint16Array(Math.max(2, src.length + (src.length % 2)));
    out.set(src);
    const gpu = known?.gpu !== undefined && known.gpu.size >= out.byteLength ? known.gpu : this.device.createBuffer({ size: out.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    this.queue.writeBuffer(gpu, 0, out);
    b.floatCopies.set("u8index", { version: b.version, gpu });
    return gpu;
  }

  // ---------------------------------------------------------------- submission

  private readonly afterSubmit: (() => void)[] = [];

  /** An upload is about to change a resource the open batch already drew with: submit first so GL's order holds. */
  private orderFlush(): void {
    this.stats.orderFlushes += 1;
    this.submit();
  }

  /** End the open pass, upload the batch's uniforms and submit its commands. */
  private submit(): void {
    this.endPass();
    if (this.encoder === null) return;
    if (this.stagingUsed > 0) {
      this.queue.writeBuffer(this.ring, 0, this.staging, 0, Math.ceil(this.stagingUsed / 4) * 4);
      this.stats.uniformBytes += this.stagingUsed;
    }
    if (this.constantsUsed > 0) this.queue.writeBuffer(this.constantRing, 0, this.constants, 0, this.constantsUsed);
    this.resolveStamps(this.encoder);
    this.queue.submit([this.encoder.finish()]);
    this.stats.submits += 1;
    if (!this.lagSampling) {
      this.lagSampling = true;
      const sent = performance.now();
      void this.queue.onSubmittedWorkDone().then(() => {
        this.stats.queueLagMs = performance.now() - sent;
        this.lagSampling = false;
      });
    }
    this.encoder = null;
    this.stagingUsed = 0;
    this.constantsUsed = 0;
    this.batch += 1;
    for (const f of this.afterSubmit.splice(0)) f();
  }

  /** Copy the back buffer onto the canvas (flipped to top-down) and submit the frame. */
  private present(): void {
    this.presentScheduled = false;
    this.endPass();
    // As GL, the canvas shows a new image only when the default framebuffer was drawn this task.
    if (!this.backDirty || this.backColor === null) { this.submit(); return; }
    this.backDirty = false;
    const encoder = (this.encoder ??= this.device.createCommandEncoder());
    if (this.presentPipeline === null) {
      const module = this.device.createShaderModule({ code: PRESENT_WGSL });
      this.presentPipeline = this.device.createRenderPipeline({ layout: "auto", vertex: { module, entryPoint: "vs" }, fragment: { module, entryPoint: "fs", targets: [{ format: this.canvasFormat }] }, primitive: { topology: "triangle-list" } });
    }
    this.presentGroup ??= this.device.createBindGroup({ layout: this.presentPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: this.backColor.createView() }] });
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.gpuContext.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 0] }] });
    pass.setPipeline(this.presentPipeline);
    pass.setBindGroup(0, this.presentGroup);
    pass.draw(3);
    pass.end();
    this.submit();
    this.stats.frames += 1;
  }
}

/** One vertex component as GL reads it into a float attribute. */
function readComponent(src: DataView, at: number, type: number, normalized: boolean): number {
  let v: number;
  switch (type) {
    case 0x1400: v = src.getInt8(at); break;
    case 0x1401: v = src.getUint8(at); break;
    case 0x1402: v = src.getInt16(at, true); break;
    case 0x1403: v = src.getUint16(at, true); break;
    case 0x1404: v = src.getInt32(at, true); break;
    case 0x1405: v = src.getUint32(at, true); break;
    default: return src.getFloat32(at, true);
  }
  if (!normalized) return v;
  const max = type === 0x1400 ? 127 : type === 0x1401 ? 255 : type === 0x1402 ? 32767 : type === 0x1403 ? 65535 : type === 0x1404 ? 2147483647 : 4294967295;
  return Math.max(-1, v / max);
}

function formatBytes(format: GPUVertexFormat): number {
  const m = /(\d+)(?:x(\d))?$/.exec(format);
  if (m === null) return 4;
  return (Number(m[1]) / 8) * Number(m[2] ?? 1);
}

function widenRows(bytes: Uint8Array, width: number, rows: number, rowBytes: number, widen: NonNullable<GlTextureFormat["widen"]>): Uint8Array {
  const e = widen.element;
  const out = new Uint8Array(width * rows * 4 * e);
  const dst = new DataView(out.buffer);
  for (let r = 0; r < rows; r += 1) {
    for (let x = 0; x < width; x += 1) {
      const from = r * rowBytes + x * 3 * e;
      const to = (r * width + x) * 4 * e;
      out.set(bytes.subarray(from, from + 3 * e), to);
      if (e === 1) out[to + 3] = widen.alpha;
      else if (e === 2) dst.setUint16(to + 6, widen.alpha, true);
      else dst.setFloat32(to + 12, widen.alpha, true);
    }
  }
  return out;
}

function flipRows(bytes: Uint8Array, rowBytes: number, height: number, depth: number): Uint8Array {
  const out = new Uint8Array(rowBytes * height * depth);
  for (let z = 0; z < depth; z += 1) {
    for (let r = 0; r < height; r += 1) {
      const from = (z * height + r) * rowBytes;
      out.set(bytes.subarray(from, from + rowBytes), (z * height + (height - 1 - r)) * rowBytes);
    }
  }
  return out;
}
