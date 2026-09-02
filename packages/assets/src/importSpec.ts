/** Supported logical kinds for user-supplied assets. */
export type AssetImportKind = "model" | "texture" | "material" | "sprite" | "spriteSheet" | "audio" | "font" | "hdri";

/** A validated description of files to ingest into a game project. */
export interface AssetImportSpec {
  id: string;
  kind: AssetImportKind;
  files: { path: string; role?: string }[];
  meta?: Record<string, unknown>;
}

/** Result of validating an import description. */
export type ImportSpecValidation = { ok: true; entry: AssetImportSpec } | { ok: false; reason: string };

const kinds = new Set<AssetImportKind>(["model", "texture", "material", "sprite", "spriteSheet", "audio", "font", "hdri"]);
const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/** Validate the stable, serializable import contract before ingesting files. */
export function validateImportSpec(spec: AssetImportSpec): ImportSpecValidation {
  if (spec === null || typeof spec !== "object") return { ok: false, reason: "spec must be an object" };
  if (typeof spec.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(spec.id)) return { ok: false, reason: "id must be a non-empty path-safe string" };
  if (!kinds.has(spec.kind)) return { ok: false, reason: "kind is unsupported" };
  if (!Array.isArray(spec.files) || spec.files.length === 0) return { ok: false, reason: "files must contain at least one file" };
  if (spec.files.some((file) => !file || typeof file.path !== "string" || file.path.length === 0 || file.path.includes(".."))) return { ok: false, reason: "files must have safe non-empty paths" };
  return { ok: true, entry: { ...spec, files: spec.files.map((file) => ({ path: file.path, ...(file.role === undefined ? {} : { role: file.role }) })) } };
}

/** Classify common asset bytes, using magic bytes and JSON sprite-sheet metadata. */
export function classifyAssetFile(bytes: Uint8Array, filename: string): AssetImportKind | null {
  const lower = filename.toLowerCase();
  if (bytes.length >= 4 && text(bytes.subarray(0, 4)) === "glTF") return "model";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "texture";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "texture";
  if (bytes.length >= 12 && text(bytes.subarray(0, 4)) === "RIFF" && text(bytes.subarray(8, 12)) === "WAVE") return "audio";
  if (bytes.length >= 4 && text(bytes.subarray(0, 4)) === "OggS") return "audio";
  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return "audio";
  if (bytes.length >= 4 && ((bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) || text(bytes.subarray(0, 4)) === "OTTO" || text(bytes.subarray(0, 4)) === "wOFF")) return "font";
  if (bytes.length >= 12 && text(bytes.subarray(0, 12)) === "\xabKTX 20\xbb\r\n\x1a\n") return "texture";
  if (bytes.length >= 4 && bytes[0] === 0x76 && bytes[1] === 0x2f && bytes[2] === 0x31 && bytes[3] === 0x01) return "hdri";
  if (lower.endsWith(".woff2")) return "font";
  if (lower.endsWith(".hdr")) return "hdri";
  if (lower.endsWith(".exr")) return "hdri";
  if (lower.endsWith(".json")) {
    try { if (typeof JSON.parse(text(bytes)).frames === "object") return "spriteSheet"; } catch { /* not a sprite sheet */ }
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".ktx2")) return "texture";
  if (lower.endsWith(".wav") || lower.endsWith(".ogg") || lower.endsWith(".mp3")) return "audio";
  if (lower.endsWith(".ttf") || lower.endsWith(".otf") || lower.endsWith(".woff2")) return "font";
  return null;
}
