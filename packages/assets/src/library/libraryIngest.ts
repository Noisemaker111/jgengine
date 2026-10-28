import { EXCLUDED_PROVIDERS, normalizeLibraryLicense, type LibraryLicense } from "./libraryLicense";
import type { LibraryRecord, LibraryRecordFile } from "./assetLibrary";
import { GAMEICONS_ARTISTS, GAMEICONS_CC0_ARTISTS, GAMEICONS_PACK } from "./libraryIcons";
import { rocketboxAnimationRecords } from "./libraryRocketbox";
import { GAMEICONS_REVISION, ROCKETBOX_REVISION, type LibraryKind, type LibrarySourceId } from "./librarySources";

/** The fetch seam ingest uses; tests pass a stub. */
export type IngestFetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

/** What every ingester takes. */
export interface IngestOptions {
  fetchImpl?: IngestFetch;
  /** GitHub token for tree listings (raises the API rate limit; optional). */
  githubToken?: string;
  /** Cap on records, for a quick sample. */
  limit?: number;
  log?: (line: string) => void;
}

function fetcher(options: IngestOptions): IngestFetch {
  return options.fetchImpl ?? ((url, init) => fetch(url, init));
}

async function getJson(options: IngestOptions, url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const response = await fetcher(options)(url, { headers: { "user-agent": "jgengine-asset-library", ...headers } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Lowercase, trimmed, de-duplicated tags with ids, numbers and noise dropped.
 *
 * @internal
 */
export function cleanTags(raw: readonly string[], drop: readonly string[] = []): string[] {
  const dropped = new Set(drop.map((value) => value.toLowerCase()));
  const out: string[] = [];
  for (const value of raw) {
    const tag = value.trim().toLowerCase().replace(/[_\s]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
    if (tag.length < 2 || tag.length > 32 || /^\d+$/.test(tag) || dropped.has(tag) || out.includes(tag)) continue;
    out.push(tag);
  }
  return out;
}

function titleWords(name: string): string[] {
  return name
    .replace(/\.(glb|gltf|svg|fbx)$/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length > 0 && !/^\d+$/.test(word));
}

function titleCase(name: string): string {
  return titleWords(name)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function limited<T>(items: T[], options: IngestOptions): T[] {
  return options.limit === undefined ? items : items.slice(0, options.limit);
}

const AMBIENTCG_KINDS: Record<string, LibraryKind> = { Material: "material", Decal: "decal", Atlas: "decal", HDRI: "hdri" };

/**
 * ambientCG: every material, decal, atlas and HDRI from its public API (CC0).
 *
 * @internal
 */
export async function ingestAmbientcg(options: IngestOptions = {}): Promise<LibraryRecord[]> {
  const records: LibraryRecord[] = [];
  for (let offset = 0; ; offset += 250) {
    const page = await getJson(options, `https://ambientcg.com/api/v2/full_json?limit=250&offset=${offset}&sort=Alphabet`);
    const found = isRecord(page) ? list(page["foundAssets"]) : [];
    for (const asset of found) {
      if (!isRecord(asset)) continue;
      const id = str(asset["assetId"]);
      const kind = AMBIENTCG_KINDS[str(asset["dataType"]) ?? ""];
      if (id === undefined || kind === undefined) continue;
      const category = str(asset["displayCategory"]);
      const tags = cleanTags(
        [...(category === undefined ? [] : [category]), ...list(asset["tags"]).flatMap((tag) => (typeof tag === "string" ? [tag] : [])), ...(str(asset["dataType"]) === "Atlas" ? ["atlas"] : [])],
        [id],
      );
      records.push({ id, title: str(asset["displayName"]) ?? titleCase(id), kind, tags });
    }
    options.log?.(`ambientcg: ${records.length} records`);
    if (found.length < 250 || (options.limit !== undefined && records.length >= options.limit)) break;
  }
  return limited(records, options);
}

const POLYHAVEN_KINDS: Record<number, LibraryKind> = { 0: "hdri", 1: "material", 2: "model" };

/**
 * Poly Haven: every model, texture and HDRI from its public API (CC0), with polycount, size and authors.
 *
 * @internal
 */
export async function ingestPolyhaven(options: IngestOptions = {}): Promise<LibraryRecord[]> {
  const all = await getJson(options, "https://api.polyhaven.com/assets");
  if (!isRecord(all)) throw new Error("Poly Haven /assets returned no object");
  const records: LibraryRecord[] = [];
  for (const [id, asset] of Object.entries(all).sort(([a], [b]) => a.localeCompare(b))) {
    if (!isRecord(asset)) continue;
    const kind = POLYHAVEN_KINDS[num(asset["type"]) ?? -1];
    if (kind === undefined) continue;
    const authors = isRecord(asset["authors"]) ? Object.keys(asset["authors"]) : [];
    const tags = cleanTags([...list(asset["categories"]), ...list(asset["tags"])].flatMap((tag) => (typeof tag === "string" ? [tag] : [])));
    const record: LibraryRecord = { id, title: str(asset["name"]) ?? titleCase(id), kind, tags };
    if (authors.length > 0) record.author = authors.join(", ");
    const triangles = num(asset["polycount"]);
    if (kind === "model" && triangles !== undefined) record.triangles = triangles;
    const dims = list(asset["dimensions"]).map(num);
    const [x, y, z] = dims;
    if (kind === "model" && x !== undefined && y !== undefined && z !== undefined) {
      // Poly Haven reports millimetres with Z up.
      record.size = [round(x / 1000), round(z / 1000), round(y / 1000)];
    }
    records.push(record);
  }
  return limited(records, options);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

async function gitTree(options: IngestOptions, repo: string, ref: string): Promise<string[]> {
  const headers: Record<string, string> = { accept: "application/vnd.github+json" };
  if (options.githubToken !== undefined) headers["authorization"] = `Bearer ${options.githubToken}`;
  const tree = await getJson(options, `https://api.github.com/repos/${repo}/git/trees/${ref}?recursive=1`, headers);
  if (!isRecord(tree) || !Array.isArray(tree["tree"])) throw new Error(`${repo}: no git tree`);
  if (tree["truncated"] === true) throw new Error(`${repo}: git tree truncated; ingest needs the full listing`);
  return tree["tree"].flatMap((node: unknown) => (isRecord(node) && typeof node["path"] === "string" ? [node["path"]] : []));
}

/**
 * game-icons.net: every SVG in the pinned repo, credited per artist (CC BY 3.0, two artists CC0).
 *
 * @internal
 */
export async function ingestGameicons(options: IngestOptions = {}): Promise<LibraryRecord[]> {
  const paths = await gitTree(options, "game-icons/icons", GAMEICONS_REVISION);
  const records: LibraryRecord[] = [];
  for (const path of paths.filter((value) => /^[^/]+\/[^/]+\.svg$/.test(value)).sort()) {
    const [folder = "", file = ""] = path.split("/");
    const name = file.replace(/\.svg$/, "");
    const author = GAMEICONS_ARTISTS[folder];
    if (author === undefined) throw new Error(`game-icons.net folder "${folder}" has no credited artist; add it to GAMEICONS_ARTISTS from license.txt`);
    const license: LibraryLicense = GAMEICONS_CC0_ARTISTS.has(folder) ? "CC0-1.0" : "CC-BY-3.0";
    records.push({
      id: `${folder}/${name}`,
      title: titleCase(name),
      kind: "icon",
      tags: cleanTags(titleWords(name)),
      author,
      ...(license === "CC-BY-3.0" ? {} : { license }),
      pack: GAMEICONS_PACK,
      file: path,
    });
  }
  return limited(records, options);
}

/** Sketchfab licence filters the library indexes; everything else (NC, SA, ND, editorial, store) is never requested. */
const SKETCHFAB_LICENSES = ["cc0", "by"] as const;

/** Sketchfab categories whose models the browser files under characters. */
const SKETCHFAB_CHARACTER_CATEGORIES = new Set(["characters-creatures", "animals-pets"]);

/**
 * Sketchfab: downloadable CC0 and CC BY models from the public search API, most liked first. Each
 * result's own licence label is re-checked, so a mislabelled result is dropped, not trusted.
 * Search needs no token; `assets pull` needs `SKETCHFAB_TOKEN`.
 *
 * @internal
 */
export async function ingestSketchfab(options: IngestOptions & { pagesPerLicense?: number } = {}): Promise<LibraryRecord[]> {
  const records: LibraryRecord[] = [];
  const seen = new Set<string>();
  for (const license of SKETCHFAB_LICENSES) {
    let url: string | undefined = `https://api.sketchfab.com/v3/search?type=models&downloadable=true&license=${license}&sort_by=-likeCount&count=24`;
    for (let page = 0; url !== undefined && page < (options.pagesPerLicense ?? 40); page += 1) {
      const body = await getJson(options, url);
      if (!isRecord(body)) break;
      for (const result of list(body["results"])) {
        const record = sketchfabRecord(result);
        if (record === null || seen.has(record.id)) continue;
        seen.add(record.id);
        records.push(record);
      }
      url = str(body["next"]);
      options.log?.(`sketchfab ${license}: ${records.length} records`);
    }
  }
  return limited(records, options);
}

/**
 * One Sketchfab search result as a record, or null when its licence, age rating or fields fail the gate.
 *
 * @internal
 */
export function sketchfabRecord(result: unknown): LibraryRecord | null {
  if (!isRecord(result) || result["isAgeRestricted"] === true) return null;
  const id = str(result["uid"]);
  const name = str(result["name"]);
  const licenseLabel = isRecord(result["license"]) ? str(result["license"]["label"]) : undefined;
  const license = licenseLabel === undefined ? null : normalizeLibraryLicense(licenseLabel);
  const user = isRecord(result["user"]) ? result["user"] : {};
  const author = str(user["displayName"]) ?? str(user["username"]);
  if (id === undefined || name === undefined || license === null || author === undefined) return null;
  const images = isRecord(result["thumbnails"]) ? list(result["thumbnails"]["images"]) : [];
  const thumb = images
    .filter(isRecord)
    .map((image) => ({ width: num(image["width"]) ?? 0, url: str(image["url"]) }))
    .filter((image) => image.url !== undefined && image.width >= 200)
    .sort((a, b) => a.width - b.width)[0]?.url;
  const categories = list(result["categories"]).flatMap((category) => (isRecord(category) && typeof category["name"] === "string" ? [category["name"]] : []));
  const rigged = (num(result["animationCount"]) ?? 0) > 0;
  if (EXCLUDED_PROVIDERS.test(`${author} ${name} ${list(result["tags"]).map((tag) => (isRecord(tag) ? String(tag["slug"]) : "")).join(" ")}`)) return null;
  const tags = cleanTags([...categories, ...list(result["tags"]).flatMap((tag) => (isRecord(tag) && typeof tag["slug"] === "string" ? [tag["slug"]] : [])).slice(0, 12)]);
  const record: LibraryRecord = {
    id,
    title: name.slice(0, 80),
    kind: categories.some((category) => SKETCHFAB_CHARACTER_CATEGORIES.has(category)) ? "character" : "model",
    tags,
    author,
    license,
    ...(thumb === undefined ? {} : { thumbnail: thumb }),
  };
  const triangles = num(result["faceCount"]);
  if (triangles !== undefined) record.triangles = triangles;
  if (rigged) record.rigged = true;
  return record;
}

/**
 * Microsoft Rocketbox: every avatar and animal folder at the pinned commit (MIT), all rigged, and
 * every animation clip in its shared skeleton's library.
 *
 * @internal
 */
export async function ingestRocketbox(options: IngestOptions = {}): Promise<LibraryRecord[]> {
  const paths = await gitTree(options, "microsoft/Microsoft-Rocketbox", ROCKETBOX_REVISION);
  const folders = paths.filter((path) => /^Assets\/Avatars\/[^/]+\/[^/]+$/.test(path) || /^Assets\/Animals\/[^/]+$/.test(path));
  const records: LibraryRecord[] = [];
  for (const folder of folders.sort()) {
    const id = folder.slice("Assets/".length);
    const name = id.split("/").pop() ?? id;
    if (!paths.some((path) => path.startsWith(`${folder}/`) && path.endsWith(".fbx"))) continue;
    const group = id.split("/").slice(0, -1).map((part) => part.toLowerCase());
    const tags = cleanTags([...group, ...titleWords(name), id.startsWith("Animals/") ? "animal" : "human", "rigged"]);
    // The browser previews each folder's own `<name>.png`; a folder without one is not listed.
    if (!paths.includes(`${folder}/${name}.png`)) continue;
    records.push({ id, title: titleCase(name), kind: "character", tags, rigged: true });
  }
  records.push(...rocketboxAnimationRecords(paths));
  return limited(records, options);
}

/** One KayKit pack the library lists from its repository tree before any pull has indexed it. */
export interface KayKitTreePack {
  pack: string;
  repo: string;
  tags: readonly string[];
}

/**
 * KayKit packs without a generated pack index: listed from their GitHub trees (CC0).
 *
 * @internal
 */
export async function ingestKaykitTrees(packs: readonly KayKitTreePack[], options: IngestOptions = {}): Promise<LibraryRecord[]> {
  const records: LibraryRecord[] = [];
  for (const pack of packs) {
    const paths = await gitTree(options, `KayKit-Game-Assets/${pack.repo}`, "main");
    const models = paths.filter((path) => /\.(glb|gltf)$/i.test(path) && /gltf|glb/i.test(path.split("/").slice(0, -1).join("/")));
    const byName = new Map<string, string>();
    for (const path of models.sort()) {
      const file = path.split("/").pop() ?? path;
      const stem = file.replace(/\.(glb|gltf)$/i, "");
      if (!byName.has(stem) || /\.glb$/i.test(file)) byName.set(stem, file.replace(/\.gltf$/i, ".glb"));
    }
    for (const [stem, file] of byName) {
      records.push({ id: `${pack.pack}/${stem}`, title: titleCase(stem), kind: "model", tags: cleanTags([...pack.tags, ...titleWords(stem)]), pack: pack.pack, file });
    }
    options.log?.(`kaykit ${pack.pack}: ${byName.size} models`);
  }
  return limited(records, options);
}

/**
 * Wraps records in the committed file shape.
 *
 * @internal
 */
export function recordFile(source: LibrarySourceId, records: readonly LibraryRecord[], ingested = new Date().toISOString().slice(0, 10)): LibraryRecordFile {
  return { source, ingested, records };
}
