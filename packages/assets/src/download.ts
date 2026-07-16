import { unzipSync } from "fflate";

import { isScrapeDownload, type AssetSource } from "./manifest";

export type FetchLike = typeof fetch;

export interface ExtractedGlb {
  file: string;
  bytes: Uint8Array;
}

export interface ExtractedTexture {
  /** Path relative to the pack output dir, e.g. "Textures/colormap.png". */
  file: string;
  bytes: Uint8Array;
}

function resolveRelative(path: string, pageUrl: string): string {
  try {
    return new URL(path, pageUrl).toString();
  } catch {
    return path;
  }
}

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

export async function downloadArchive(url: string, fetchImpl: FetchLike = fetch): Promise<Uint8Array> {
  const response = await fetchImpl(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`download ${url} -> HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Layout for the `--mirror` / `JGENGINE_ASSETS_MIRROR` base URL override: the
 * archive for a pack is expected at `<baseUrl>/<provider>/<packId>.zip`, e.g.
 * `https://my-mirror.example.com/kenney/kenney-nature.zip`.
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

/** URL of `source`'s archive on the default GitHub-release mirror. */
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
  const entries = unzipSync(archive, { filter: (file) => pattern.test(file.name) });
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

/**
 * Pack a `.gltf` + optional external `.bin` into a single `.glb` so reindex /
 * the shell only ever deal in one-file models. Strips buffer `uri` fields so
 * the binary chunk is self-contained. External image URIs stay as-is (loaders
 * resolve relative to the catalog URL only for GLB-embedded images).
 * @internal
 */
export function packGltfToGlb(gltfBytes: Uint8Array, binBytes?: Uint8Array): Uint8Array {
  const json = JSON.parse(new TextDecoder().decode(gltfBytes)) as {
    buffers?: { uri?: string; byteLength?: number }[];
  };
  if (Array.isArray(json.buffers)) {
    for (const buffer of json.buffers) {
      delete buffer.uri;
      if (binBytes !== undefined) buffer.byteLength = binBytes.byteLength;
    }
  }
  const jsonText = JSON.stringify(json);
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

/**
 * Pull every GLB out of an archive. Also converts co-located `.gltf` + `.bin`
 * pairs (Quaternius Standard packs on OpenGameArt) into `.glb` so the catalog
 * stays one-file-per-model. GLB wins when both formats share a basename.
 */
export function extractGlbs(archive: Uint8Array): ExtractedGlb[] {
  const entries = unzipSync(archive, {
    filter: (file) => /\.(glb|gltf|bin)$/i.test(file.name),
  });
  const byDirBase = new Map<string, { glb?: Uint8Array; gltf?: Uint8Array; bin?: Uint8Array }>();
  for (const [path, bytes] of Object.entries(entries)) {
    const parts = path.replace(/\\/g, "/").split("/");
    const file = parts.pop();
    if (file === undefined || file.length === 0) continue;
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
  for (const [key, slot] of byDirBase) {
    const base = key.split("\0")[1]!;
    const file = `${base}.glb`;
    if (slot.glb !== undefined) {
      if (!byName.has(file)) byName.set(file, slot.glb);
      continue;
    }
    if (slot.gltf !== undefined) {
      if (!byName.has(file)) byName.set(file, packGltfToGlb(slot.gltf, slot.bin));
    }
  }
  return Array.from(byName, ([file, bytes]) => ({ file, bytes })).sort((a, b) =>
    a.file.localeCompare(b.file),
  );
}

/** One SVG/PNG file pulled out of a sprite/icon-pack archive by `extractSpriteFiles`. */
export interface ExtractedSpriteFile {
  file: string;
  bytes: Uint8Array;
}

/** Pulls every SVG/PNG out of a sprite/icon-pack archive, deduped by basename regardless of nesting depth. */
export function extractSpriteFiles(archive: Uint8Array): ExtractedSpriteFile[] {
  return dedupeByBasename(archive, /\.(svg|png)$/i);
}

const TEXTURE_ENTRY = /(?:^|\/)(Textures\/[^/]+)$/i;

export function extractTextures(archive: Uint8Array): ExtractedTexture[] {
  const entries = unzipSync(archive, {
    filter: (file) => TEXTURE_ENTRY.test(file.name),
  });
  const byRel = new Map<string, Uint8Array>();
  for (const [path, bytes] of Object.entries(entries)) {
    const match = path.match(TEXTURE_ENTRY);
    if (match === null) continue;
    const rel = match[1]!;
    if (!byRel.has(rel)) byRel.set(rel, bytes);
  }
  return Array.from(byRel, ([file, bytes]) => ({ file, bytes })).sort((a, b) =>
    a.file.localeCompare(b.file),
  );
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
