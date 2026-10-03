/** Supported logical kinds for user-supplied assets. */
export type AssetImportKind = "model" | "texture" | "material" | "sprite" | "spriteSheet" | "audio" | "font" | "hdri";

/** A game-owned import description; paths are relative POSIX paths, roles are authored labels. */
export interface AssetImportSpec {
  id: string;
  kind: AssetImportKind;
  files: { path: string; role?: string }[];
  meta?: Record<string, unknown>;
}

/** Result of validating an import description; a successful entry is an independent JSON snapshot. */
export type ImportSpecValidation = { ok: true; entry: AssetImportSpec } | { ok: false; reason: string };

const kinds = new Set<string>(["model", "texture", "material", "sprite", "spriteSheet", "audio", "font", "hdri"]);
const decoder = new TextDecoder("utf-8", { fatal: true });

function record(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.values(Object.getOwnPropertyDescriptors(value)).every((descriptor) => "value" in descriptor && descriptor.enumerable);
}

function safePath(value: string): boolean {
  return value.length > 0 && value.trim() === value && !/[\\\u0000-\u001f\u007f:%?#]/.test(value)
    && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function jsonData(value: unknown, ancestors = new Set<object>(), depth = 0): boolean {
  if (depth > 64) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value)) return false;
  if (!Array.isArray(value) && !record(value)) return false;
  if (Reflect.ownKeys(value).some((key) => typeof key === "symbol")
    || Object.values(Object.getOwnPropertyDescriptors(value)).some((descriptor) => !("value" in descriptor))) return false;
  ancestors.add(value);
  const valid = Array.isArray(value)
    ? Object.keys(value).length === value.length && Array.from(value).every((item) => jsonData(item, ancestors, depth + 1))
    : Object.values(value).every((item) => jsonData(item, ancestors, depth + 1));
  ancestors.delete(value);
  return valid;
}

/**
 * Validate untrusted import descriptions without filesystem access or path rewriting.
 * Requires unique relative files, printable non-empty roles and plain JSON metadata (maximum depth 64).
 * @capability asset-import-validation validate game-owned multi-file asset descriptions before ingest
 */
export function validateImportSpec(spec: unknown): ImportSpecValidation {
  if (!record(spec)) return { ok: false, reason: "spec must be an object" };
  if (typeof spec.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(spec.id) || !safePath(spec.id)) {
    return { ok: false, reason: "id must be a non-empty path-safe string" };
  }
  if (typeof spec.kind !== "string" || !kinds.has(spec.kind)) return { ok: false, reason: "kind is unsupported" };
  if (!Array.isArray(spec.files) || spec.files.length === 0) return { ok: false, reason: "files must contain at least one file" };
  const paths = new Set<string>();
  const files: AssetImportSpec["files"] = [];
  for (const file of spec.files) {
    if (!record(file) || typeof file.path !== "string" || !safePath(file.path)) return { ok: false, reason: "files must have safe non-empty relative paths" };
    if (paths.has(file.path)) return { ok: false, reason: `duplicate file path: ${file.path}` };
    if (file.role !== undefined && (typeof file.role !== "string" || file.role.trim() !== file.role || file.role.length === 0 || /[\u0000-\u001f\u007f]/.test(file.role))) {
      return { ok: false, reason: `file role must be a non-empty printable string: ${file.path}` };
    }
    paths.add(file.path);
    files.push({ path: file.path, ...(file.role === undefined ? {} : { role: file.role }) });
  }
  if (spec.meta !== undefined && (!record(spec.meta) || !jsonData(spec.meta))) return { ok: false, reason: "meta must contain plain JSON data without cycles or non-finite numbers" };
  return {
    ok: true,
    entry: {
      id: spec.id,
      kind: spec.kind as AssetImportKind,
      files,
      ...(spec.meta === undefined ? {} : { meta: JSON.parse(JSON.stringify(spec.meta)) as Record<string, unknown> }),
    },
  };
}

function match(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return bytes.length >= offset + signature.length && signature.every((byte, i) => bytes[offset + i] === byte);
}

function ascii(bytes: Uint8Array, value: string, offset = 0): boolean {
  return bytes.length >= offset + value.length && [...value].every((char, i) => bytes[offset + i] === char.charCodeAt(0));
}

function json(bytes: Uint8Array): unknown {
  let start = match(bytes, [0xef, 0xbb, 0xbf]) ? 3 : 0;
  while ([0x20, 0x09, 0x0a, 0x0d].includes(bytes[start]!)) start += 1;
  if (bytes[start] !== 0x7b) return null;
  try { return JSON.parse(decoder.decode(bytes)); } catch { return null; }
}

function gltf(value: unknown): boolean {
  return record(value) && record(value.asset) && typeof value.asset.version === "string" && /^2\.\d+$/.test(value.asset.version);
}

function wav(bytes: Uint8Array, view: DataView): boolean {
  if (bytes.length < 12 || !ascii(bytes, "WAVE", 8) || view.getUint32(4, true) !== bytes.length - 8) return false;
  let format = false;
  let data = false;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const size = view.getUint32(offset + 4, true);
    if (size > bytes.length - offset - 8) return false;
    if (ascii(bytes, "fmt ", offset)) format = size >= 16 && view.getUint16(offset + 8, true) > 0 && view.getUint16(offset + 10, true) > 0 && view.getUint32(offset + 12, true) > 0;
    if (ascii(bytes, "data", offset)) data = size > 0;
    offset += 8 + size + (size % 2);
  }
  return format && data && offset === bytes.length;
}

function exr(bytes: Uint8Array, view: DataView): boolean {
  if (bytes.length < 9 || (view.getUint32(4, true) & 0xff) !== 2) return false;
  let offset = 8;
  const attributes = new Set<string>();
  while (offset < bytes.length && bytes[offset] !== 0) {
    const nameEnd = bytes.indexOf(0, offset);
    if (nameEnd < 0) return false;
    const name = new TextDecoder().decode(bytes.subarray(offset, nameEnd));
    const typeEnd = bytes.indexOf(0, nameEnd + 1);
    if (typeEnd < 0 || bytes.length < typeEnd + 5) return false;
    const size = view.getUint32(typeEnd + 1, true);
    offset = typeEnd + 5;
    if (size > bytes.length - offset) return false;
    attributes.add(name);
    offset += size;
  }
  return attributes.has("channels") && attributes.has("compression") && attributes.has("dataWindow") && bytes.length >= offset + 9;
}

function mp3Frame(bytes: Uint8Array, start: number): boolean {
  if (bytes.length < start + 4) return false;
  const b1 = bytes[start + 1]!;
  const b2 = bytes[start + 2]!;
  if (bytes[start] !== 0xff || (b1 & 0xe0) !== 0xe0) return false;
  const version = (b1 >> 3) & 3;
  const layer = (b1 >> 1) & 3;
  const bitrateIndex = b2 >> 4;
  const sampleIndex = (b2 >> 2) & 3;
  if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleIndex === 3 || (bytes[start + 3]! & 3) === 2) return false;
  const rates = version === 3 ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const frequency = [44100, 48000, 32000][sampleIndex]! / (version === 3 ? 1 : version === 2 ? 2 : 4);
  const length = Math.floor((version === 3 ? 144000 : 72000) * rates[bitrateIndex]! / frequency) + ((b2 >> 1) & 1);
  return length >= 4 && bytes.length - start >= length;
}

function mp3(bytes: Uint8Array): boolean {
  if (!ascii(bytes, "ID3")) return mp3Frame(bytes, 0);
  if (bytes.length < 10 || bytes[3]! < 2 || bytes[3]! > 4 || bytes[4] === 0xff || bytes.subarray(6, 10).some((byte) => byte > 0x7f)) return false;
  const version = bytes[3]!;
  const flags = bytes[5]!;
  if ((flags & (version === 2 ? 0x3f : version === 3 ? 0x1f : 0x0f)) !== 0) return false;
  const size = bytes[6]! * 2097152 + bytes[7]! * 16384 + bytes[8]! * 128 + bytes[9]!;
  return mp3Frame(bytes, 10 + size + (version === 4 && (flags & 0x10) !== 0 ? 10 : 0));
}

/**
 * Classify supported container headers from complete file bytes; filenames never override bytes.
 * Recognizes GLB/glTF, PNG/JPEG/KTX2, Ogg/WAV/MP3, TTF/OTF/WOFF/WOFF2, HDR/EXR and JSON sprite sheets.
 * This is format detection, not decoder validation. Images classify as texture; authors choose sprite/material in the spec.
 * @capability asset-byte-classification identify custom asset formats from bytes instead of filename extensions
 */
export function classifyAssetFile(bytes: Uint8Array, _filename: string): AssetImportKind | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (ascii(bytes, "glTF")) {
    if (bytes.length < 20 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length || view.getUint32(16, true) !== 0x4e4f534a) return null;
    const length = view.getUint32(12, true);
    return length > 0 && length % 4 === 0 && length <= bytes.length - 20 && gltf(json(bytes.subarray(20, 20 + length))) ? "model" : null;
  }
  if (match(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return bytes.length >= 33 && view.getUint32(8) === 13 && ascii(bytes, "IHDR", 12) && view.getUint32(16) > 0 && view.getUint32(20) > 0 ? "texture" : null;
  }
  if (match(bytes, [0xff, 0xd8, 0xff])) return bytes.length >= 4 && bytes[3] !== 0 && bytes[3] !== 0xff ? "texture" : null;
  if (match(bytes, [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return bytes.length >= 80 && view.getUint32(20, true) > 0 && view.getUint32(40, true) > 0 && bytes.length >= 80 + view.getUint32(40, true) * 24 ? "texture" : null;
  }
  if (ascii(bytes, "RIFF")) return wav(bytes, view) ? "audio" : null;
  if (ascii(bytes, "OggS")) {
    if (bytes.length < 27 || bytes[4] !== 0 || (bytes[5]! & 0xf8) !== 0 || bytes.length < 27 + bytes[26]!) return null;
    const payload = bytes.subarray(27, 27 + bytes[26]!).reduce((sum, size) => sum + size, 0);
    return bytes[26]! > 0 && payload > 0 && bytes.length >= 27 + bytes[26]! + payload ? "audio" : null;
  }
  if (mp3(bytes)) return "audio";
  if (match(bytes, [0, 1, 0, 0]) || ascii(bytes, "OTTO")) {
    if (bytes.length < 12) return null;
    const tables = view.getUint16(4);
    if (tables === 0 || bytes.length < 12 + tables * 16) return null;
    for (let i = 0; i < tables; i += 1) {
      const offset = view.getUint32(12 + i * 16 + 8);
      const length = view.getUint32(12 + i * 16 + 12);
      if (offset > bytes.length || length > bytes.length - offset) return null;
    }
    return "font";
  }
  if (ascii(bytes, "wOFF") || ascii(bytes, "wOF2")) {
    const minimum = ascii(bytes, "wOF2") ? 48 : 44;
    return bytes.length > minimum && view.getUint32(8) === bytes.length && view.getUint16(12) > 0 && view.getUint16(14) === 0 ? "font" : null;
  }
  if (match(bytes, [0x76, 0x2f, 0x31, 0x01])) return exr(bytes, view) ? "hdri" : null;
  if (ascii(bytes, "#?RADIANCE\n") || ascii(bytes, "#?RGBE\n") || ascii(bytes, "#?RADIANCE\r\n") || ascii(bytes, "#?RGBE\r\n")) {
    const header = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 4096)));
    const resolution = /\r?\n\r?\n[+-]([XY]) ([1-9]\d*) [+-]([XY]) ([1-9]\d*)\r?\n/.exec(header);
    return header.includes("FORMAT=32-bit_rle_rgbe") && resolution !== null && resolution[1] !== resolution[3] && bytes.length > resolution.index + resolution[0].length ? "hdri" : null;
  }
  const value = json(bytes);
  if (gltf(value)) return "model";
  if (record(value) && (record(value.frames) || Array.isArray(value.frames)) && Object.keys(value.frames).length > 0) return "spriteSheet";
  return null;
}
