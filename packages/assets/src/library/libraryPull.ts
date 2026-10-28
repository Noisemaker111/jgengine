import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { unzipSync } from "fflate";

import type { ModelLibraryEntry } from "../catalogs/modelLibrary";
import type { AssetSource } from "../manifest";
import { MATERIAL_MAP_FILES, type MaterialMapRole } from "../materialMapFiles";
import { pullLibraryModel } from "../modelLibraryPull";
import { pullRocketboxModel } from "../rocketboxPull";
import { sourceById } from "../sources";
import type { LibraryEntry } from "./assetLibrary";
import { librarySource } from "./librarySources";
import { libraryServedPath, lowerLibraryId, type LibraryServedPath } from "./libraryServed";

/** What {@link pullLibraryEntry} needs from its caller. */
export interface LibraryPullContext {
  /** The `public/`-shaped root to write into (a game's `public/` or the shared asset store). */
  outRoot: string;
  fetchImpl?: typeof fetch;
  /** Pulls a whole catalog pack through the ordinary `assets pull <source>` path. */
  pullPack: (source: AssetSource) => Promise<void>;
  githubToken?: string;
  env?: Readonly<Record<string, string | undefined>>;
  log?: (line: string) => void;
}

async function bytesOf(fetchImpl: typeof fetch, url: string, headers: Record<string, string> = {}): Promise<Uint8Array> {
  const response = await fetchImpl(url, { headers });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function jsonOf(fetchImpl: typeof fetch, url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const response = await fetchImpl(url, { headers });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pick(value: unknown, ...path: string[]): unknown {
  let current = value;
  for (const key of path) current = isRecord(current) ? current[key] : undefined;
  return current;
}

/**
 * The material source `assets pull` uses for one ambientCG material or decal (same id scheme as the shipped catalog).
 *
 * @internal
 */
export function ambientcgLibrarySource(entry: LibraryEntry): AssetSource {
  const id = `ambientcg-${lowerLibraryId(entry.id)}`;
  return (
    sourceById.get(id) ?? {
      id,
      kind: "material",
      provider: "ambientcg",
      title: entry.title,
      license: entry.license,
      author: entry.author,
      categories: entry.tags,
      download: { url: `https://ambientcg.com/get?file=${encodeURIComponent(entry.id)}_1K-JPG.zip` },
      homepage: entry.page,
    }
  );
}

const POLYHAVEN_MAPS: readonly [MaterialMapRole, readonly string[]][] = [
  ["color", ["Diffuse", "diff", "Color"]],
  ["normal", ["nor_gl", "Normal"]],
  ["roughness", ["Rough", "rough"]],
  ["ao", ["AO", "ao"]],
  ["displacement", ["Displacement", "disp"]],
];

/**
 * Pulls one library entry into `ctx.outRoot` at {@link libraryServedPath}: pack entries through the
 * pack pull, ambientCG materials through the material path, Poly Haven and Rocketbox models through
 * the model library's converters, Poly Haven textures and HDRIs and ambientCG HDRIs as files, and a
 * Sketchfab model through its download API with the token named by the source (`SKETCHFAB_TOKEN`).
 *
 * @capability library-pull fetch one library asset (model, material, HDRI, icon pack) into the folder a game serves it from
 */
export async function pullLibraryEntry(entry: LibraryEntry, ctx: LibraryPullContext): Promise<LibraryServedPath> {
  const fetchImpl = ctx.fetchImpl ?? fetch;
  const served = libraryServedPath(entry);
  const dir = join(ctx.outRoot, ...served.dir.split("/"));
  if (entry.pack !== undefined) {
    const pack = sourceById.get(entry.pack);
    if (pack === undefined) throw new Error(`${entry.key}: pack ${entry.pack} is not in the catalog`);
    await ctx.pullPack(pack);
    return served;
  }
  if (entry.source === "ambientcg" && entry.kind !== "hdri") {
    await ctx.pullPack(ambientcgLibrarySource(entry));
    return served;
  }
  if (entry.source === "ambientcg") {
    const archive = await bytesOf(fetchImpl, `https://ambientcg.com/get?file=${encodeURIComponent(entry.id)}_1K.zip`);
    const files = unzipSync(archive, { filter: (file) => /\.exr$/i.test(file.name) });
    const first = Object.entries(files)[0];
    if (first === undefined) throw new Error(`${entry.key}: archive holds no .exr`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${entry.id}.exr`), first[1]);
    return served;
  }
  if (entry.source === "polyhaven" && entry.kind === "model") {
    const model: ModelLibraryEntry = {
      name: `polyhaven/${entry.id}`,
      title: entry.title,
      genres: [],
      intents: [],
      origin: { provider: "polyhaven", asset: entry.id, near: 1, far: 0.25 },
      author: entry.author,
      license: entry.license,
      homepage: entry.page,
    };
    await pullLibraryModel(model, { modelsRoot: join(ctx.outRoot, "models"), fetchImpl });
    return served;
  }
  if (entry.source === "polyhaven") {
    const files = await jsonOf(fetchImpl, `https://api.polyhaven.com/files/${encodeURIComponent(entry.id)}`);
    mkdirSync(dir, { recursive: true });
    if (entry.kind === "hdri") {
      const url = pick(files, "hdri", "1k", "hdr", "url");
      if (typeof url !== "string") throw new Error(`${entry.key}: Poly Haven lists no 1k HDR`);
      writeFileSync(join(dir, `${entry.id}.hdr`), await bytesOf(fetchImpl, url));
      return served;
    }
    let wrote = 0;
    for (const [role, keys] of POLYHAVEN_MAPS) {
      const key = keys.find((candidate) => typeof pick(files, candidate, "1k", "jpg", "url") === "string");
      const url = key === undefined ? undefined : pick(files, key, "1k", "jpg", "url");
      if (typeof url !== "string") continue;
      writeFileSync(join(dir, MATERIAL_MAP_FILES[role]), await bytesOf(fetchImpl, url));
      wrote += 1;
    }
    if (wrote === 0) throw new Error(`${entry.key}: Poly Haven lists no 1k JPG maps`);
    return served;
  }
  if (entry.source === "rocketbox") {
    const name = entry.id.split("/").pop() ?? entry.id;
    const model: ModelLibraryEntry = {
      name: `rocketbox/${name}`,
      title: entry.title,
      genres: [],
      intents: [],
      origin: { provider: "rocketbox", path: entry.id, rootBone: "Bip01", clips: [] },
      author: entry.author,
      license: entry.license,
      homepage: entry.page,
    };
    await pullRocketboxModel(model, { modelsRoot: join(ctx.outRoot, "models"), fetchImpl, ...(ctx.githubToken === undefined ? {} : { githubToken: ctx.githubToken }) });
    return served;
  }
  if (entry.source === "sketchfab") {
    const tokenName = librarySource("sketchfab")?.token ?? "SKETCHFAB_TOKEN";
    const token = (ctx.env ?? process.env)[tokenName];
    if (token === undefined || token.trim() === "") {
      throw new Error(`${entry.key}: Sketchfab downloads need an API token; set ${tokenName} (sketchfab.com/settings/password)`);
    }
    const download = await jsonOf(fetchImpl, `https://api.sketchfab.com/v3/models/${encodeURIComponent(entry.id)}/download`, { authorization: `Token ${token.trim()}` });
    const url = pick(download, "glb", "url");
    if (typeof url !== "string") throw new Error(`${entry.key}: Sketchfab offers no GLB download for this model`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "model.glb"), await bytesOf(fetchImpl, url));
    return served;
  }
  throw new Error(`${entry.key}: no pull route for ${entry.source} ${entry.kind}`);
}
