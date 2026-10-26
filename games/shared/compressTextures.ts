import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, extname, join, relative, sep } from "node:path";

import jpeg from "jpeg-js";
import { encodeToKTX2 } from "ktx2-encoder";

import { decodePng } from "../../packages/assets/src/imageCodec";
import {
  contentKey,
  fileContentKey,
  imageVariantName,
  imageVariantQuery,
  modelVariantName,
  roleFromName,
  TEXTURE_VARIANT_VERSION,
  type ImageVariantRequest,
  type TextureOrient,
  type TextureRole,
} from "./textureVariants";

/**
 * The encoder side of `textureVariants.ts`: walks a game's `public/` and writes a Basis UASTC KTX2
 * twin of every model texture and loose image map into the asset store's `.ktx2/` cache, plus a
 * twin of every glTF/GLB that names those textures through `KHR_texture_basisu`. It runs where the
 * store is provisioned (`games:provision`, a dev server's start), never in CI and never in a game.
 *
 * UASTC keeps the look of the source maps (it transcodes to BC7 on desktop GPUs); zstd keeps the
 * files small; mipmaps are baked in, so the GPU upload is the whole chain with no generation pass.
 */

export interface EncodeJob extends ImageVariantRequest {
  bytes: Uint8Array;
}

export interface DecodedImage {
  width: number;
  height: number;
  data: Uint8Array;
}

/** PNG (8-bit) or JPEG bytes to top-row-first RGBA. */
export async function decodeImage(bytes: Uint8Array): Promise<DecodedImage> {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return decodePng(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    const image = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
    return { width: image.width, height: image.height, data: image.data };
  }
  throw new Error("not a PNG or JPEG");
}

/** Block-compressed formats need whole 4×4 blocks at the top level; past 4096 the encoder runs out of room. */
export function encodableSize(width: number, height: number): boolean {
  return width >= 4 && height >= 4 && width % 4 === 0 && height % 4 === 0 && Math.max(width, height) <= 4096;
}

/** One KTX2 encode, or null when the image's size cannot be block-compressed. */
export async function encodeKtx2(job: EncodeJob, decode: (bytes: Uint8Array) => Promise<DecodedImage>): Promise<Uint8Array | null> {
  const image = await decode(job.bytes);
  if (!encodableSize(image.width, image.height)) return null;
  const color = job.role === "color";
  return encodeToKTX2(job.bytes, {
    isUASTC: true,
    uastcLDRQualityLevel: 1,
    needSupercompression: true,
    generateMipmap: true,
    isKTX2File: true,
    isYFlip: job.orient === "flip",
    isPerceptual: color,
    isSetKTX2SRGBTransferFunc: color,
    isNormalMap: job.role === "normal",
    enableDebug: false,
    imageDecoder: async () => image,
  });
}

// ---------------------------------------------------------------------------------------------
// glTF / GLB

interface GltfImage {
  uri?: string;
  bufferView?: number;
  mimeType?: string;
  name?: string;
}

interface GltfTexture {
  source?: number;
  sampler?: number;
  extensions?: Record<string, unknown>;
}

export interface GltfJson {
  images?: GltfImage[];
  textures?: GltfTexture[];
  materials?: Record<string, unknown>[];
  bufferViews?: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
  buffers?: { uri?: string; byteLength: number }[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
}

const ROLE_RANK: Record<TextureRole, number> = { data: 0, color: 1, normal: 2 };

function slotRole(slot: string): TextureRole {
  if (/normal/i.test(slot)) return "normal";
  if (slot === "baseColorTexture" || slot === "emissiveTexture" || /Color/.test(slot)) return "color";
  return "data";
}

/** Every image a model's materials sample, with the role its slots give it (normal over colour over data). */
export function modelImageRoles(json: GltfJson): Map<number, TextureRole> {
  const roles = new Map<number, TextureRole>();
  const visit = (value: unknown, slot: string): void => {
    if (value === null || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (slot.endsWith("Texture") && typeof record.index === "number") {
      const texture = json.textures?.[record.index];
      // A texture already pointing at another image format (WebP, KTX2) is left as authored.
      if (texture?.source === undefined || Object.keys(texture.extensions ?? {}).length > 0) return;
      const role = slotRole(slot);
      const known = roles.get(texture.source);
      if (known === undefined || ROLE_RANK[role] > ROLE_RANK[known]) roles.set(texture.source, role);
      return;
    }
    for (const [key, child] of Object.entries(record)) visit(child, key);
  };
  for (const material of json.materials ?? []) visit(material, "");
  return roles;
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

export function readGlb(bytes: Uint8Array): { json: GltfJson; bin: Uint8Array | null } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error("not a GLB");
  let at = 12;
  let json: GltfJson | null = null;
  let bin: Uint8Array | null = null;
  while (at + 8 <= bytes.byteLength) {
    const length = view.getUint32(at, true);
    const type = view.getUint32(at + 4, true);
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(body)) as GltfJson;
    else if (type === CHUNK_BIN && bin === null) bin = body;
    at += 8 + length;
  }
  if (json === null) throw new Error("GLB without a JSON chunk");
  return { json, bin };
}

function pad4(length: number): number {
  return (length + 3) & ~3;
}

export function writeGlb(json: GltfJson, bin: Uint8Array | null): Uint8Array {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = pad4(jsonBytes.byteLength);
  const binLength = bin === null ? 0 : pad4(bin.byteLength);
  const total = 12 + 8 + jsonLength + (bin === null ? 0 : 8 + binLength);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, CHUNK_JSON, true);
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonLength);
  if (bin !== null) {
    const at = 20 + jsonLength;
    view.setUint32(at, binLength, true);
    view.setUint32(at + 4, CHUNK_BIN, true);
    out.set(bin, at + 8);
  }
  return out;
}

/** An image a model samples: a file beside it, or bytes inside its binary chunk. */
export type ModelImage = { index: number; role: TextureRole } & ({ kind: "file"; file: string; uri: string } | { kind: "embedded"; bytes: Uint8Array });

/** The images of a parsed model the encoder can give a twin. */
export function modelImages(json: GltfJson, modelDir: string, bin: Uint8Array | null): ModelImage[] {
  const found: ModelImage[] = [];
  for (const [index, role] of modelImageRoles(json)) {
    const image = json.images?.[index];
    if (image === undefined) continue;
    if (image.uri !== undefined) {
      if (image.uri.startsWith("data:") || /[?#]/.test(image.uri) || !/\.(png|jpe?g)$/i.test(image.uri)) continue;
      const file = join(modelDir, decodeURIComponent(image.uri));
      if (existsSync(file)) found.push({ index, role, kind: "file", file, uri: image.uri });
      continue;
    }
    if (image.bufferView === undefined || bin === null) continue;
    if (image.mimeType !== "image/png" && image.mimeType !== "image/jpeg") continue;
    const view = json.bufferViews?.[image.bufferView];
    if (view === undefined || view.buffer !== 0) continue;
    const start = view.byteOffset ?? 0;
    found.push({ index, role, kind: "embedded", bytes: bin.subarray(start, start + view.byteLength) });
  }
  return found;
}

/** A twin for one model image: a query naming a file's twin, or the KTX2 bytes to embed. */
export type ImageTwin = { kind: "file"; uri: string } | { kind: "embedded"; ktx2: Uint8Array };

/**
 * The model with each twinned image added as a KTX2 image that its textures name through
 * `KHR_texture_basisu`. The original image stays each texture's `source`, so a loader without a
 * KTX2 transcoder still draws the model; embedded twins are appended to the binary chunk.
 */
export function applyImageTwins(json: GltfJson, bin: Uint8Array | null, twins: ReadonlyMap<number, ImageTwin>): { json: GltfJson; bin: Uint8Array | null } {
  const out = structuredClone(json);
  out.images ??= [];
  const twinIndex = new Map<number, number>();
  const appended: Uint8Array[] = [];
  let binLength = bin === null ? 0 : pad4(bin.byteLength);
  for (const [index, twin] of twins) {
    if (twin.kind === "file") {
      twinIndex.set(index, out.images.push({ uri: twin.uri, mimeType: "image/ktx2" }) - 1);
      continue;
    }
    out.bufferViews ??= [];
    const byteOffset = binLength;
    const view = out.bufferViews.push({ buffer: 0, byteOffset, byteLength: twin.ktx2.byteLength }) - 1;
    appended.push(twin.ktx2);
    binLength = pad4(byteOffset + twin.ktx2.byteLength);
    twinIndex.set(index, out.images.push({ bufferView: view, mimeType: "image/ktx2" }) - 1);
  }
  for (const texture of out.textures ?? []) {
    const twin = texture.source === undefined ? undefined : twinIndex.get(texture.source);
    if (twin === undefined || Object.keys(texture.extensions ?? {}).length > 0) continue;
    texture.extensions = { KHR_texture_basisu: { source: twin } };
  }
  if (twinIndex.size > 0 && !(out.extensionsUsed ?? []).includes("KHR_texture_basisu")) out.extensionsUsed = [...(out.extensionsUsed ?? []), "KHR_texture_basisu"];
  if (appended.length === 0) return { json: out, bin };
  const merged = new Uint8Array(binLength);
  if (bin !== null) merged.set(bin, 0);
  let at = bin === null ? 0 : pad4(bin.byteLength);
  for (const bytes of appended) {
    merged.set(bytes, at);
    at = pad4(at + bytes.byteLength);
  }
  out.buffers ??= [];
  if (out.buffers[0] === undefined) out.buffers[0] = { byteLength: merged.byteLength };
  else out.buffers[0].byteLength = merged.byteLength;
  return { json: out, bin: merged };
}

// ---------------------------------------------------------------------------------------------
// The pass over a game's public/ folder

/** Every file under `dir`, following the store links a game's `public/` is made of, each real folder once. */
function walk(dir: string, seen = new Set<string>(), out: string[] = []): string[] {
  let real: string;
  try {
    real = realpathSync(dir);
  } catch {
    return out;
  }
  if (seen.has(real)) return out;
  seen.add(real);
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".")) continue;
    const path = join(dir, entry);
    let stat;
    try {
      stat = statSync(path);
    } catch {
      continue;
    }
    if (stat.isDirectory()) walk(path, seen, out);
    else out.push(path);
  }
  return out;
}

function writeAtomic(path: string, bytes: Uint8Array | string): void {
  const temp = `${path}.tmp-${process.pid}`;
  writeFileSync(temp, bytes);
  renameSync(temp, path);
}

/** A pool of encoder workers; the wasm encoder is single-threaded, so this is where cores go. */
class EncoderPool {
  private readonly workers: Worker[] = [];
  private readonly idle: Worker[] = [];
  private readonly queue: { job: EncodeJob; resolve: (out: Uint8Array | null) => void }[] = [];
  private readonly pending = new Map<number, (out: Uint8Array | null) => void>();
  private next = 0;

  constructor(size: number) {
    for (let i = 0; i < size; i += 1) {
      const worker = new Worker(new URL("./compressTextureWorker.ts", import.meta.url).href);
      worker.onmessage = (event: MessageEvent<{ id: number; out: Uint8Array | null }>) => {
        this.pending.get(event.data.id)?.(event.data.out);
        this.pending.delete(event.data.id);
        this.idle.push(worker);
        this.pump();
      };
      this.workers.push(worker);
      this.idle.push(worker);
    }
  }

  encode(job: EncodeJob): Promise<Uint8Array | null> {
    return new Promise((resolve) => {
      this.queue.push({ job, resolve });
      this.pump();
    });
  }

  private pump(): void {
    while (this.idle.length > 0 && this.queue.length > 0) {
      const worker = this.idle.pop()!;
      const { job, resolve } = this.queue.shift()!;
      const id = this.next++;
      this.pending.set(id, resolve);
      worker.postMessage({ id, job });
    }
  }

  close(): void {
    for (const worker of this.workers) worker.terminate();
  }
}

export interface CompressResult {
  /** Image twins written by this call. */
  images: number;
  /** Model twins written by this call. */
  models: number;
  /** Images that cannot be block-compressed (size) or decoded; served as they are. */
  skipped: number;
}

const IMAGE = /\.(png|jpe?g)$/i;
const MODEL = /\.(gltf|glb)$/i;
// Folders of UI art a canvas never samples as a material map.
const NOT_MAPS = new Set(["sprites", "ui", "icons", "fonts", "audio", "sounds", "music"]);

function isMapCandidate(publicDir: string, file: string): boolean {
  const top = relative(publicDir, file).split(sep)[0] ?? "";
  return !NOT_MAPS.has(top.toLowerCase());
}

/** The lock that keeps two compressors (two dev servers starting at once) off the same cache. */
function takeLock(variantDir: string): (() => void) | null {
  const path = join(variantDir, ".lock");
  const tryTake = (): boolean => {
    try {
      closeSync(openSync(path, "wx"));
      writeFileSync(path, String(process.pid));
      return true;
    } catch {
      return false;
    }
  };
  if (!tryTake()) {
    const holder = Number(readFileSync(path, "utf8"));
    let alive = false;
    try {
      alive = Number.isInteger(holder) && holder > 0 && process.kill(holder, 0);
    } catch {
      alive = false;
    }
    if (alive) return null;
    unlinkSync(path);
    if (!tryTake()) return null;
  }
  return () => {
    try {
      unlinkSync(path);
    } catch {
      // already gone
    }
  };
}

/**
 * Write every missing twin for the files under `publicDirs` into `variantDir`. Model textures get
 * the role their material slots give them; a loose image gets its role from its name in both row
 * orders (`ImageTextureLoader` stores rows bottom-first, glTF-convention loaders top-first).
 * Returns null when another compressor holds the cache.
 */
export async function compressTextures(
  publicDirs: readonly string[],
  variantDir: string,
  options: { log?: (line: string) => void; workers?: number } = {},
): Promise<CompressResult | null> {
  const log = options.log ?? console.log;
  mkdirSync(variantDir, { recursive: true });
  const release = takeLock(variantDir);
  if (release === null) {
    log("textures: another compressor is filling the cache; skipping");
    return null;
  }
  const result: CompressResult = { images: 0, models: 0, skipped: 0 };
  const pool = new EncoderPool(options.workers ?? Math.max(1, Math.min(8, Math.floor(cpus().length / 2))));
  try {
    const files: { publicDir: string; file: string }[] = [];
    for (const publicDir of publicDirs) for (const file of walk(publicDir)) files.push({ publicDir, file });

    // Image twins, by content: one encode per (bytes, role, row order) however many games hold it.
    const encodes = new Map<string, Promise<boolean>>();
    const ensureImage = (key: string, bytes: () => Uint8Array, request: ImageVariantRequest): Promise<boolean> => {
      const name = imageVariantName(key, request);
      let pending = encodes.get(name);
      if (pending !== undefined) return pending;
      const target = join(variantDir, name);
      const failed = `${target}.skip`;
      if (existsSync(target)) pending = Promise.resolve(true);
      else if (existsSync(failed)) pending = Promise.resolve(false);
      else
        pending = pool.encode({ bytes: bytes(), ...request }).then((out) => {
          if (out === null) {
            writeAtomic(failed, "");
            result.skipped += 1;
            return false;
          }
          writeAtomic(target, out);
          result.images += 1;
          return true;
        });
      encodes.set(name, pending);
      return pending;
    };

    const referenced = new Set<string>();
    const models: Promise<void>[] = [];
    const modelKeys = new Set<string>();
    for (const { file } of files) {
      if (!MODEL.test(file)) continue;
      const extension = extname(file).toLowerCase() as ".gltf" | ".glb";
      const bytes = new Uint8Array(readFileSync(file));
      let parsed: { json: GltfJson; bin: Uint8Array | null };
      try {
        parsed = extension === ".glb" ? readGlb(bytes) : { json: JSON.parse(new TextDecoder().decode(bytes)) as GltfJson, bin: null };
      } catch {
        continue;
      }
      const images = modelImages(parsed.json, dirname(file), extension === ".glb" ? parsed.bin : null);
      for (const image of images) if (image.kind === "file") referenced.add(image.file);
      const key = contentKey(bytes);
      const target = join(variantDir, modelVariantName(key, extension));
      const none = `${target}.skip`;
      if (modelKeys.has(key) || existsSync(target) || existsSync(none) || images.length === 0) continue;
      modelKeys.add(key);
      models.push(
        (async () => {
          const twins = new Map<number, ImageTwin>();
          await Promise.all(
            images.map(async (image) => {
              const request = { role: image.role, orient: "top" as const };
              if (image.kind === "file") {
                if (await ensureImage(fileContentKey(image.file), () => new Uint8Array(readFileSync(image.file)), request)) twins.set(image.index, { kind: "file", uri: `${image.uri}?${imageVariantQuery(image.role, "top")}` });
                return;
              }
              const imageKey = contentKey(image.bytes);
              if (await ensureImage(imageKey, () => image.bytes.slice(), request)) twins.set(image.index, { kind: "embedded", ktx2: new Uint8Array(readFileSync(join(variantDir, imageVariantName(imageKey, request)))) });
            }),
          );
          if (twins.size === 0) {
            writeAtomic(none, "");
            return;
          }
          const next = applyImageTwins(parsed.json, parsed.bin, twins);
          writeAtomic(target, extension === ".glb" ? writeGlb(next.json, next.bin) : JSON.stringify(next.json));
          result.models += 1;
        })(),
      );
    }

    // Loose maps: a material pack's `color.jpg`, a scan, an authored surface map.
    const loose: Promise<boolean>[] = [];
    for (const { publicDir, file } of files) {
      if (!IMAGE.test(file) || referenced.has(file) || !isMapCandidate(publicDir, file)) continue;
      const role = roleFromName(file);
      const key = fileContentKey(file);
      for (const orient of ["top", "flip"] satisfies TextureOrient[]) loose.push(ensureImage(key, () => new Uint8Array(readFileSync(file)), { role, orient }));
    }
    await Promise.all([...models, ...loose]);
    log(`textures: ${result.images} image twin(s) and ${result.models} model twin(s) written to ${variantDir} (v${TEXTURE_VARIANT_VERSION})${result.skipped > 0 ? `, ${result.skipped} left as authored (size not block-compressible)` : ""}`);
    return result;
  } finally {
    pool.close();
    release();
  }
}
