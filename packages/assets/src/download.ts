import { unzipSync, type UnzipFileFilter, type UnzipFileInfo } from "fflate";

import { isScrapeDownload, type AssetSource } from "./manifest";

export type FetchLike = typeof fetch;

/** Max size of a downloaded (still-compressed) archive, in bytes. Provider zips run tens of MB; this leaves headroom without buffering an unbounded response. */
export const MAX_ARCHIVE_DOWNLOAD_BYTES = 256 * 1024 * 1024;
/** Max total uncompressed size this module will inflate out of one archive, in bytes. */
export const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;
/** Max number of entries this module will extract out of one archive. */
export const MAX_ARCHIVE_ENTRY_COUNT = 20_000;
/** Max allowed originalSize/size ratio for a single archive entry — past this it's treated as a zip bomb. */
export const MAX_ARCHIVE_COMPRESSION_RATIO = 100;

/** @internal */
export function boundedExtractFilter(matches: UnzipFileFilter): UnzipFileFilter {
  let totalUncompressedBytes = 0;
  let entryCount = 0;
  return (file: UnzipFileInfo) => {
    if (!matches(file)) return false;
    if (file.size > 0 && file.originalSize / file.size > MAX_ARCHIVE_COMPRESSION_RATIO) {
      throw new Error(
        `archive entry "${file.name}" has a ${(file.originalSize / file.size).toFixed(0)}x compression ratio, exceeds the ${MAX_ARCHIVE_COMPRESSION_RATIO}x zip-bomb guard`,
      );
    }
    totalUncompressedBytes += file.originalSize;
    if (totalUncompressedBytes > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
      throw new Error(
        `archive would extract more than the ${MAX_ARCHIVE_UNCOMPRESSED_BYTES} byte uncompressed-size cap`,
      );
    }
    entryCount += 1;
    if (entryCount > MAX_ARCHIVE_ENTRY_COUNT) {
      throw new Error(`archive has more than the ${MAX_ARCHIVE_ENTRY_COUNT} entry cap`);
    }
    return true;
  };
}

export interface ExtractedGlb {
  file: string;
  bytes: Uint8Array;
}

/** An image a pack's models reference, shipped flat beside the `.glb` files. */
export interface ExtractedPackImage {
  /** Flat basename, e.g. "citybits_texture.png" — models reference it relative to their own URL. */
  file: string;
  bytes: Uint8Array;
}

const PACK_IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

/** Flatten a glTF image URI ("../Textures/color%20map.png") to its decoded basename. */
function imageUriBasename(uri: string): string {
  const decoded = (() => {
    try {
      return decodeURIComponent(uri);
    } catch {
      return uri;
    }
  })();
  const clean = decoded.replace(/\\/g, "/");
  return clean.split("/").pop() ?? clean;
}

interface GltfImageJson {
  images?: { uri?: string; bufferView?: number }[];
}

/**
 * Rewrite external image URIs to flat basenames so a model always finds its
 * texture beside itself in the pack dir, no matter how the source archive
 * nested it ("Textures/x.png", "../texture/x.png", "x.png" all become "x.png").
 * Returns the basenames of every external image the model references.
 */
function normalizeGltfImageUris(json: GltfImageJson): string[] {
  const referenced: string[] = [];
  for (const image of json.images ?? []) {
    if (image.uri === undefined || image.uri.startsWith("data:")) continue;
    const base = imageUriBasename(image.uri);
    image.uri = base;
    referenced.push(base);
  }
  return referenced;
}

function resolveRelative(path: string, pageUrl: string): string {
  try {
    return new URL(path, pageUrl).toString();
  } catch {
    return path;
  }
}

/** @internal */
export function findArchiveUrl(html: string, pageUrl: string): string | null {
  const matches = html.match(/[^\s"'()<>]+\.zip/gi);
  if (matches === null) return null;
  const ranked = matches.sort((a, b) => score(b) - score(a));
  const best = ranked[0];
  return best === undefined ? null : resolveRelative(best, pageUrl);
}

function score(candidate: string): number {
  let value = 0;
  if (candidate.includes("/media/")) value += 2;
  if (candidate.includes("download")) value += 1;
  if (candidate.startsWith("http") || candidate.startsWith("/")) value += 1;
  return value;
}

/** @internal */
export async function resolveArchiveUrl(source: AssetSource, fetchImpl: FetchLike = fetch): Promise<string> {
  const download = source.download;
  if (!isScrapeDownload(download)) return download.url;
  const response = await fetchImpl(download.scrape, { redirect: "follow" });
  if (!response.ok) throw new Error(`scrape ${download.scrape} -> HTTP ${response.status}`);
  const html = await response.text();
  const url = findArchiveUrl(html, download.scrape);
  if (url === null) {
    throw new Error(
      `no downloadable .zip found at ${download.scrape} (provider may require manual download)`,
    );
  }
  return url;
}

/** @internal */
export async function downloadArchive(url: string, fetchImpl: FetchLike = fetch): Promise<Uint8Array> {
  const response = await fetchImpl(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`download ${url} -> HTTP ${response.status}`);
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const declared = Number(declaredLength);
    if (Number.isFinite(declared) && declared > MAX_ARCHIVE_DOWNLOAD_BYTES) {
      throw new Error(`download ${url} declares ${declared} bytes, exceeds the ${MAX_ARCHIVE_DOWNLOAD_BYTES} byte cap`);
    }
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_ARCHIVE_DOWNLOAD_BYTES) {
    throw new Error(`download ${url} is ${bytes.byteLength} bytes, exceeds the ${MAX_ARCHIVE_DOWNLOAD_BYTES} byte cap`);
  }
  return bytes;
}

/**
 * Layout for the `--mirror` / `JGENGINE_ASSETS_MIRROR` base URL override: the
 * archive for a pack is expected at `<baseUrl>/<provider>/<packId>.zip`, e.g.
 * `https://my-mirror.example.com/kenney/kenney-nature.zip`.
  * @internal
  */
export function mirrorOverrideUrl(baseUrl: string, source: AssetSource): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/${source.provider}/${source.id}.zip`;
}

/**
 * Default asset mirror: this repo's own GitHub Releases, reachable from every
 * cloud sandbox without network-policy changes (github.com is on the default
 * allowlist). Assets live on the rolling `packs` release, one flat zip per
 * pack named `<provider>-<packId>.zip`, kept in sync with the source catalog
 * by `.github/workflows/mirror-assets.yml` — adding a catalog entry is the
 * whole publishing step. Override the chain with `--mirror` /
 * `JGENGINE_ASSETS_MIRROR`, or disable this hop with
 * `JGENGINE_ASSETS_NO_DEFAULT_MIRROR=1`.
 */
export const DEFAULT_RELEASE_BASE =
  "https://github.com/Noisemaker111/jgengine/releases/download/packs";

/** URL of `source`'s archive on the default GitHub-release mirror.
 * @internal
 */
export function defaultReleaseUrl(source: AssetSource): string {
  return `${DEFAULT_RELEASE_BASE}/${source.provider}-${source.id}.zip`;
}

async function verifyPinnedSha(source: AssetSource, archive: Uint8Array): Promise<void> {
  const download = source.download;
  if (isScrapeDownload(download) || download.sha256 === undefined) return;
  const actual = await sha256Hex(archive);
  if (actual !== download.sha256) {
    throw new Error(`sha256 mismatch: expected ${download.sha256}, got ${actual}`);
  }
}

export interface DownloadPackOptions {
  /** Explicit mirror base override (CLI `--mirror` / `JGENGINE_ASSETS_MIRROR`), tried before the primary provider path. */
  mirrorBase?: string;
  fetchImpl?: FetchLike;
}

export interface DownloadPackResult {
  archive: Uint8Array;
  url: string;
  /** Every URL attempted, in order, ending with the one that succeeded. */
  attempted: readonly string[];
}

/**
 * Resolves and downloads a pack's archive, trying sources in order until one
 * succeeds: (1) the mirror base override at `mirrorOverrideUrl`, (2) the
 * default GitHub-release mirror at `defaultReleaseUrl` (skipped when
 * `JGENGINE_ASSETS_NO_DEFAULT_MIRROR=1`), (3) the primary provider path
 * (`resolveArchiveUrl`: scrape or pinned URL), (4) the pack's own `mirror`
 * URL. A pinned `sha256` is verified against whichever
 * source supplied the bytes; a mismatch is treated as a failed attempt so the
 * next source in the chain is tried. Throws with every attempted URL and its
 * failure reason when all sources fail.
  * @internal
  */
export async function downloadPackArchive(
  source: AssetSource,
  options: DownloadPackOptions = {},
): Promise<DownloadPackResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const attempted: string[] = [];
  const errors: string[] = [];

  const tryUrl = async (url: string): Promise<DownloadPackResult | undefined> => {
    attempted.push(url);
    try {
      const archive = await downloadArchive(url, fetchImpl);
      await verifyPinnedSha(source, archive);
      return { archive, url, attempted };
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  };

  if (options.mirrorBase !== undefined) {
    const result = await tryUrl(mirrorOverrideUrl(options.mirrorBase, source));
    if (result !== undefined) return result;
  }

  if (process.env.JGENGINE_ASSETS_NO_DEFAULT_MIRROR !== "1") {
    const result = await tryUrl(defaultReleaseUrl(source));
    if (result !== undefined) return result;
  }

  try {
    const primaryUrl = await resolveArchiveUrl(source, fetchImpl);
    const result = await tryUrl(primaryUrl);
    if (result !== undefined) return result;
  } catch (error) {
    const label = isScrapeDownload(source.download) ? source.download.scrape : source.download.url;
    errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    attempted.push(label);
  }

  if (source.mirror !== undefined) {
    const result = await tryUrl(source.mirror);
    if (result !== undefined) return result;
  }

  throw new Error(
    `failed to download ${source.id} from all ${attempted.length} source(s):\n` +
      errors.map((line) => `  - ${line}`).join("\n"),
  );
}

function dedupeByBasename(archive: Uint8Array, pattern: RegExp): { file: string; bytes: Uint8Array }[] {
  const entries = unzipSync(archive, { filter: boundedExtractFilter((file) => pattern.test(file.name)) });
  const byName = new Map<string, Uint8Array>();
  for (const [path, bytes] of Object.entries(entries)) {
    const base = path.split("/").pop();
    if (base === undefined || base.length === 0) continue;
    if (!byName.has(base)) byName.set(base, bytes);
  }
  return Array.from(byName, ([file, bytes]) => ({ file, bytes })).sort((a, b) =>
    a.file.localeCompare(b.file),
  );
}

function buildGlb(jsonText: string, binBytes?: Uint8Array): Uint8Array {
  const jsonPad = (4 - (jsonText.length % 4)) % 4;
  const jsonChunk = new Uint8Array(jsonText.length + jsonPad);
  new TextEncoder().encodeInto(jsonText, jsonChunk);
  for (let i = jsonText.length; i < jsonChunk.length; i++) jsonChunk[i] = 0x20;

  const binPad = binBytes === undefined ? 0 : (4 - (binBytes.byteLength % 4)) % 4;
  const binChunkLen = binBytes === undefined ? 0 : binBytes.byteLength + binPad;
  const total =
    12 +
    8 +
    jsonChunk.byteLength +
    (binBytes === undefined ? 0 : 8 + binChunkLen);

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); // glTF
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  let o = 12;
  view.setUint32(o, jsonChunk.byteLength, true);
  view.setUint32(o + 4, 0x4e4f534a, true); // JSON
  out.set(jsonChunk, o + 8);
  o += 8 + jsonChunk.byteLength;
  if (binBytes !== undefined) {
    view.setUint32(o, binChunkLen, true);
    view.setUint32(o + 4, 0x004e4942, true); // BIN
    out.set(binBytes, o + 8);
  }
  return out;
}

interface GlbChunks {
  json: Record<string, unknown> & GltfImageJson;
  bin?: Uint8Array;
}

/** Parse a `.glb` container into its JSON document and optional BIN chunk. Returns null for non-glb bytes. */
function parseGlb(bytes: Uint8Array): GlbChunks | null {
  if (bytes.byteLength < 20) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) return null;
  let offset = 12;
  let json: GlbChunks["json"] | undefined;
  let bin: Uint8Array | undefined;
  while (offset + 8 <= bytes.byteLength) {
    const length = view.getUint32(offset, true);
    const kind = view.getUint32(offset + 4, true);
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (kind === 0x4e4f534a) {
      try {
        json = JSON.parse(new TextDecoder().decode(body)) as GlbChunks["json"];
      } catch {
        return null;
      }
    } else if (kind === 0x004e4942) {
      bin = body;
    }
    offset += 8 + length;
  }
  if (json === undefined) return null;
  return bin === undefined ? { json } : { json, bin };
}

/**
 * External image basenames a packed `.glb` still references (its textures must
 * sit beside it in the pack dir). Empty for self-contained models.
 * @internal
 */
export function externalGlbImages(bytes: Uint8Array): string[] {
  const chunks = parseGlb(bytes);
  if (chunks === null) return [];
  return (chunks.json.images ?? [])
    .map((image) => image.uri)
    .filter((uri): uri is string => uri !== undefined && !uri.startsWith("data:"))
    .map((uri) => imageUriBasename(uri));
}

/** Rewrite a native `.glb`'s external image URIs to flat basenames; returns the input untouched when nothing changes. */
function normalizeGlbImageUris(bytes: Uint8Array): { bytes: Uint8Array; referenced: string[] } {
  const chunks = parseGlb(bytes);
  if (chunks === null) return { bytes, referenced: [] };
  const before = JSON.stringify(chunks.json.images ?? []);
  const referenced = normalizeGltfImageUris(chunks.json);
  if (referenced.length === 0 || JSON.stringify(chunks.json.images ?? []) === before) {
    return { bytes, referenced };
  }
  return { bytes: buildGlb(JSON.stringify(chunks.json), chunks.bin), referenced };
}

/**
 * Pack a `.gltf` + optional external `.bin` into a single `.glb` so reindex /
 * the shell only ever deal in one-file models. Strips buffer `uri` fields so
 * the binary chunk is self-contained; external image URIs are flattened to
 * basenames so the pack ships each referenced texture beside the models
 * (loaders resolve the relative URI against the model's own URL).
 * @internal
 */
export function packGltfToGlb(gltfBytes: Uint8Array, binBytes?: Uint8Array): Uint8Array {
  const json = JSON.parse(new TextDecoder().decode(gltfBytes)) as {
    buffers?: { uri?: string; byteLength?: number }[];
  } & GltfImageJson;
  if (Array.isArray(json.buffers)) {
    for (const buffer of json.buffers) {
      delete buffer.uri;
      if (binBytes !== undefined) buffer.byteLength = binBytes.byteLength;
    }
  }
  normalizeGltfImageUris(json);
  return buildGlb(JSON.stringify(json), binBytes);
}

/** What `extractGlbs` pulls out of a pack archive: the models plus the textures they reference. */
export interface ExtractedPack {
  models: ExtractedGlb[];
  /** Every archive image some extracted model references, flattened to basenames. */
  images: ExtractedPackImage[];
}

/**
 * Pull every GLB out of an archive, plus the textures those models reference.
 * Converts co-located `.gltf` + `.bin` pairs (Quaternius Standard packs on
 * OpenGameArt, KayKit bits packs) into `.glb` so the catalog stays
 * one-file-per-model; GLB wins when both formats share a basename. External
 * image URIs are flattened to basenames and the matching archive images are
 * returned for writing beside the models — a pulled pack renders textured, not
 * as white clay (#1005).
  * @internal
  */
export function extractGlbs(archive: Uint8Array): ExtractedPack {
  const entries = unzipSync(archive, {
    filter: boundedExtractFilter(
      (file) => /\.(glb|gltf|bin)$/i.test(file.name) || PACK_IMAGE_EXT.test(file.name),
    ),
  });
  const byDirBase = new Map<string, { glb?: Uint8Array; gltf?: Uint8Array; bin?: Uint8Array }>();
  const imagesByBase = new Map<string, Uint8Array>();
  for (const [path, bytes] of Object.entries(entries)) {
    const parts = path.replace(/\\/g, "/").split("/");
    const file = parts.pop();
    if (file === undefined || file.length === 0) continue;
    if (PACK_IMAGE_EXT.test(file)) {
      if (!imagesByBase.has(file)) imagesByBase.set(file, bytes);
      continue;
    }
    const dir = parts.join("/");
    // KayKit ships some files as `name.gltf.glb` — strip both suffixes for a clean id.
    const base = file.replace(/\.gltf\.glb$/i, "").replace(/\.(glb|gltf|bin)$/i, "");
    if (base.length === 0 || base === file) continue;
    const extMatch = file.match(/\.(glb|gltf|bin)$/i);
    if (extMatch === null) continue;
    const ext = extMatch[1]!.toLowerCase();
    const key = `${dir}\0${base}`;
    const slot = byDirBase.get(key) ?? {};
    if (ext === "glb") slot.glb = bytes;
    else if (ext === "gltf") slot.gltf = bytes;
    else if (ext === "bin") slot.bin = bytes;
    byDirBase.set(key, slot);
  }

  const byName = new Map<string, Uint8Array>();
  const referenced = new Set<string>();
  for (const [key, slot] of byDirBase) {
    const base = key.split("\0")[1]!;
    const file = `${base}.glb`;
    if (byName.has(file)) continue;
    if (slot.glb !== undefined) {
      const normalized = normalizeGlbImageUris(slot.glb);
      byName.set(file, normalized.bytes);
      for (const image of normalized.referenced) referenced.add(image);
      continue;
    }
    if (slot.gltf !== undefined) {
      const packed = packGltfToGlb(slot.gltf, slot.bin);
      byName.set(file, packed);
      for (const image of externalGlbImages(packed)) referenced.add(image);
    }
  }
  const models = Array.from(byName, ([file, bytes]) => ({ file, bytes })).sort((a, b) =>
    a.file.localeCompare(b.file),
  );
  const images = Array.from(referenced)
    .filter((file) => imagesByBase.has(file))
    .map((file) => ({ file, bytes: imagesByBase.get(file)! }))
    .sort((a, b) => a.file.localeCompare(b.file));
  return { models, images };
}

/** One SVG/PNG file pulled out of a sprite/icon-pack archive by `extractSpriteFiles`. */
export interface ExtractedSpriteFile {
  file: string;
  bytes: Uint8Array;
}

/** Pulls every SVG/PNG out of a sprite/icon-pack archive, deduped by basename regardless of nesting depth.
 * @internal
 */
export function extractSpriteFiles(archive: Uint8Array): ExtractedSpriteFile[] {
  return dedupeByBasename(archive, /\.(svg|png)$/i);
}

/** @internal */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
