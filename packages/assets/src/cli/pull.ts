#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createAssetBudgetReport, type AssetBudget } from "../assetBudget";
import { dirHasEntries } from "../assetStore";
import { cmdFind } from "./find";
import { MATERIAL_LIBRARY } from "../catalogs/materialLibrary";
import { MODEL_LIBRARY, findLibraryModelByName } from "../catalogs/modelLibrary";
import { downloadPackArchive, extractGlbs, extractSpriteFiles } from "../download";
import { type AssetKind, type AssetMatch, describeAssetMatch, rankAssets } from "../rankAssets";
import { generatedIndex } from "../generated";
import { generatedSpriteIndex } from "../generated-sprites";
import { reindex } from "../indexGen";
import { isScrapeDownload, type AssetSource, type SingleAsset } from "../manifest";
import { extractMaterialMaps } from "../materials";
import { buildAuthoredModel } from "../modelLibraryAuthored";
import { pullLibraryModel } from "../modelLibraryPull";
import { pullRocketboxModel } from "../rocketboxPull";
import { validateAssetReferences } from "../provisioning";
import { registryCatalog } from "../registry";
import { resolveGithubToken, withGithubAuth } from "./githubToken";
import {
  componentWiringSnippet,
  iconWiringSnippet,
  materialWiringSnippet,
  modelWiringSnippet,
  spriteWiringSnippet,
} from "../snippet";
import { STARTER_PEOPLE, STARTER_SOURCE_PACKS } from "../packs/starter";
import { materialSources, sourceById, spriteSources } from "../sources";
import { reindexSprites } from "../spriteIndexGen";
import { verifyManifest } from "../verify";
import { cmdLibrary } from "../library/libraryCli";
import { assetLibrary } from "../library/libraryIndex";
import { pullLibraryEntry } from "../library/libraryPull";
import { libraryServedPath } from "../library/libraryServed";
import { librarySource } from "../library/librarySources";
import {
  resolveDefaultOutputRoot,
  resolveDefaultReindexDir,
  resolveGeneratedDir,
  resolveGeneratedSpritesDir,
  resolvePackageRoot,
  resolvePackageTreeRoot,
} from "./paths";

const here = dirname(fileURLToPath(import.meta.url));
const packageTreeRoot = resolvePackageTreeRoot(here);
const pkgRoot = resolvePackageRoot(here);
/** Sibling of `cli/` under `src/` (dev) or `dist/` (published) so reindex writes the tree consumers import. */
export const generatedDir = resolveGeneratedDir(here);
/** Sprite-pack counterpart of `generatedDir`. */
export const generatedSpritesDir = resolveGeneratedSpritesDir(here);
export { resolveGeneratedDir } from "./paths";
const singlesJson = join(packageTreeRoot, "singles.json");
const localDir = join(pkgRoot, "local");
const CDN_BASE = "https://cdn.jsdelivr.net/gh/Noisemaker111/jgengine@main/packages/assets/local";

/** @internal */
function flag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

let cachedToken: { value: string | undefined } | null = null;

/** The GitHub token every pull uses, read once per run: env first, then `gh auth token`. */
export function pullGithubToken(): string | undefined {
  cachedToken ??= { value: resolveGithubToken() };
  return cachedToken.value;
}

/** One request's hard budget: `JG_FETCH_TIMEOUT_MS`, else ten minutes (the curl fallback's own cap). */
export function fetchTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const ms = Number(env["JG_FETCH_TIMEOUT_MS"]);
  return Number.isFinite(ms) && ms > 0 ? ms : 600_000;
}

/**
 * The runtime's own fetch, with a curl fallback for hosts it cannot reach —
 * some proxied sandboxes tear down bun's TLS stream to GitHub's release-asset
 * host while curl (which honors SSL_CERT_FILE) gets through fine. GitHub hosts
 * get the token, and every request has a hard budget, so a stalled body fails
 * naming its URL instead of hanging the pull.
 */
export const cliFetch: typeof fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const token = pullGithubToken();
  const timeoutMs = fetchTimeoutMs();
  const headers = withGithubAuth(url, init?.headers, token);
  try {
    return await fetch(input, { ...init, headers, signal: init?.signal ?? AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(`download hung: ${url} gave no complete answer within ${Math.round(timeoutMs / 1000)}s`, { cause: error });
    }
    if (init?.method !== undefined && init.method !== "GET") throw error;
    try {
      const auth = headers.get("authorization");
      const bytes = execFileSync(
        "curl",
        // The header comes in on stdin so the token never shows in the process list.
        ["-fsSL", "--max-time", String(Math.ceil(timeoutMs / 1000)), ...(auth === null ? [] : ["-H", "@-"]), url],
        {
          maxBuffer: 1024 * 1024 * 1024,
          timeout: timeoutMs + 10_000,
          windowsHide: true,
          ...(auth === null ? {} : { input: `authorization: ${auth}\n` }),
        },
      );
      return new Response(new Uint8Array(bytes));
    } catch {
      throw error;
    }
  }
}) as typeof fetch;

/** @internal */
export function describeNetworkFailure(error: unknown): string {
  const chain: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    chain.push(current.message);
    current = current.cause;
  }
  const text = chain.length > 0 ? chain.join(" — ") : String(error);
  const looksPolicyBlocked =
    /\b403\b|CONNECT|proxy|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed/i.test(text);
  return looksPolicyBlocked
    ? `${text}\nhint: a 403/CONNECT failure here usually means the sandbox network policy blocks this host — not a transient error, retrying won't help. Allowlist the host in the environment settings, point JGENGINE_ASSETS_MIRROR at a reachable mirror, or build with procedural geometry.`
    : text;
}

function cmdList(argv: string[]): void {
  const category = flag(argv, "category");
  const source = flag(argv, "source");
  const limit = Number(flag(argv, "limit") ?? "50");
  if (flag(argv, "kind") === "material") {
    const rows = materialSources.filter(
      (entry) => category === undefined || entry.categories.includes(category),
    );
    for (const entry of rows.slice(0, limit)) {
      console.log(`${entry.id}\t[${entry.categories.join(",")}]\t${entry.license}`);
    }
    console.log(`— ${Math.min(rows.length, limit)} of ${rows.length} materials`);
    return;
  }
  if (flag(argv, "kind") === "sprite") {
    const rows = generatedSpriteIndex.filter(
      (entry) =>
        (category === undefined || entry.categories.includes(category)) &&
        (source === undefined || entry.source === source),
    );
    for (const entry of rows.slice(0, limit)) {
      console.log(`${entry.id}\t[${entry.categories.join(",")}]\t${entry.file}`);
    }
    console.log(`— ${Math.min(rows.length, limit)} of ${rows.length} sprite/icon files`);
    return;
  }
  if (flag(argv, "kind") === "spritePack") {
    const rows = spriteSources.filter(
      (entry) => category === undefined || entry.categories.includes(category),
    );
    for (const entry of rows.slice(0, limit)) {
      console.log(`${entry.id}\t[${entry.categories.join(",")}]\t${entry.license}`);
    }
    console.log(`— ${Math.min(rows.length, limit)} of ${rows.length} sprite/icon packs`);
    return;
  }
  const rows = generatedIndex.filter(
    (entry) =>
      (category === undefined || entry.categories.includes(category)) &&
      (source === undefined || entry.source === source),
  );
  for (const entry of rows.slice(0, limit)) {
    console.log(`${entry.id}\t[${entry.categories.join(",")}]\t${entry.file}`);
  }
  console.log(`— ${Math.min(rows.length, limit)} of ${rows.length} entries`);
}

/** @internal */
export async function cmdPull(argv: string[]): Promise<void> {
  const sourceId = argv[0];
  if (sourceId === undefined) {
    fail("usage: pull <source-id|starter> [--dir <dir>] [--mirror <baseUrl>] [--offline]");
  }
  // `starter` is the meta-id a fresh game needs: every pack behind the starter catalog plus the
  // library people, so a scaffold resolves `asset:prop_crate` and its player without the caller
  // memorising ids. The lists live with the catalog they serve, not in the CLI or `jgengine create`.
  if (sourceId === "starter") {
    for (const id of STARTER_SOURCE_PACKS) await cmdPull([id, ...argv.slice(1)]);
    for (const name of STARTER_PEOPLE) await cmdPull([`model:${name}`, ...argv.slice(1)]);
    console.log(`starter: ${STARTER_SOURCE_PACKS.length} pack(s) and ${STARTER_PEOPLE.length} people ready`);
    return;
  }
  // `library` pulls every map the shared material library pins, so one command gives a game the
  // surfaces its names resolve to (roughly 360 MB of 1K-JPG archives for the whole set).
  if (sourceId === "library") {
    const pulled = new Set<string>();
    for (const entry of MATERIAL_LIBRARY) {
      if (entry.source === undefined || pulled.has(entry.source)) continue;
      pulled.add(entry.source);
      await cmdPull([entry.source, ...argv.slice(1)]);
    }
    console.log(`library: ${pulled.size} material(s) ready`);
    return;
  }
  // `model:<name>` pulls one realistic library model; `model-library` pulls every pullable entry.
  if (sourceId === "model-library" || sourceId.startsWith("model:")) {
    const outRoot = flag(argv, "dir") !== undefined ? resolve(flag(argv, "dir")!) : resolveDefaultOutputRoot(here);
    const modelsRoot = join(outRoot, "models");
    const githubToken = pullGithubToken();
    const entries =
      sourceId === "model-library"
        ? MODEL_LIBRARY.filter((entry) => entry.origin.provider !== "generated")
        : [findLibraryModelByName(sourceId.slice("model:".length)) ?? fail(`unknown library model: ${sourceId.slice(6)}`)];
    let total = 0;
    for (const entry of entries) {
      if (dirHasEntries(join(modelsRoot, "library", ...entry.name.split("/"))) && !argv.includes("--force")) {
        console.log(`${entry.name}: already pulled`);
        continue;
      }
      if (entry.origin.provider === "rocketbox") {
        const pulled = await pullRocketboxModel(entry, { modelsRoot, fetchImpl: cliFetch, ...(githubToken === undefined ? {} : { githubToken }) });
        total += pulled.bytes;
        console.log(
          `${entry.name}: ${pulled.triangles} tris, ${pulled.bones} bones, clips ${pulled.clips.join("/") || "none"}, ` +
            `${(pulled.bytes / 1e6).toFixed(2)} MB, ${pulled.height.toFixed(2)} m tall -> ${pulled.file}`,
        );
        continue;
      }
      if (entry.origin.provider === "authored") {
        const built = await buildAuthoredModel(entry, modelsRoot);
        total += built.bytes;
        console.log(`${entry.name}: ${built.triangles} tris, ${(built.bytes / 1e6).toFixed(2)} MB (built) -> ${built.file}`);
        continue;
      }
      if (entry.origin.provider === "generated") {
        console.log(`${entry.name}: generated - the game commits it; nothing to pull`);
        continue;
      }
      const pulled = await pullLibraryModel(entry, { modelsRoot, fetchImpl: cliFetch, ...(githubToken === undefined ? {} : { githubToken }) });
      total += pulled.bytes;
      console.log(
        `${entry.name}: ${pulled.nearTriangles} / ${pulled.farTriangles} tris, ` +
          `${(pulled.bytes / 1e6).toFixed(2)} MB, ${pulled.size.map((v) => v.toFixed(2)).join(" x ")} m -> ${pulled.dir}`,
      );
    }
    console.log(`model library: ${entries.length} model(s), ${(total / 1e6).toFixed(2)} MB written`);
    return;
  }
  // `<source>:<id>` pulls one shared-library entry (`polyhaven:ArmChair_01`, `gameicons:lorc/broadsword`).
  const libraryPrefix = sourceId.split(":")[0] ?? "";
  if (sourceId.includes(":") && librarySource(libraryPrefix) !== undefined) {
    const entry = assetLibrary().find((candidate) => candidate.key === sourceId) ?? fail(`unknown library key: ${sourceId} (search with: assets library search <words>)`);
    const dirFlag = flag(argv, "dir");
    const outRoot = dirFlag !== undefined ? resolve(dirFlag) : resolveDefaultOutputRoot(here);
    const served = libraryServedPath(entry);
    if (dirHasEntries(join(outRoot, ...served.dir.split("/"))) && !argv.includes("--force")) {
      console.log(`${entry.key}: already pulled -> ${served.url}`);
      return;
    }
    const mirrorBase = flag(argv, "mirror") ?? process.env["JGENGINE_ASSETS_MIRROR"];
    const githubToken = pullGithubToken();
    await pullLibraryEntry(entry, {
      outRoot,
      fetchImpl: cliFetch,
      ...(githubToken === undefined ? {} : { githubToken }),
      pullPack: async (pack) => {
        if (dirHasEntries(join(outRoot, packSubdir(pack), pack.id)) && !argv.includes("--force")) return;
        console.log(describeFetchResult(pack, await fetchPackInto(pack, outRoot, { mirrorBase })));
      },
    });
    console.log(`${entry.key}: ${entry.title} (${entry.license}, ${entry.author}) -> ${served.url}`);
    return;
  }
  const source = sourceById.get(sourceId);
  if (source === undefined) fail(`unknown source: ${sourceId}`);

  const outRoot = flag(argv, "dir") !== undefined ? resolve(flag(argv, "dir")!) : resolveDefaultOutputRoot(here);
  const outDir = join(outRoot, packSubdir(source), sourceId);
  const offline = argv.includes("--offline");
  const mirrorBase = flag(argv, "mirror") ?? process.env["JGENGINE_ASSETS_MIRROR"];

  if (offline) {
    if (!dirHasEntries(outDir)) {
      fail(
        `--offline set but ${outDir} is empty; pull it once on a connected machine (or via ` +
          `--mirror/JGENGINE_ASSETS_MIRROR) and commit/host that directory before running offline`,
      );
    }
    console.log(`offline: ${outDir} already populated, skipping network`);
    return;
  }

  const result = await fetchPackInto(source, outRoot, { mirrorBase });
  console.log(describeFetchResult(source, result));
}

function packSubdir(source: AssetSource): "materials" | "sprites" | "models" {
  if (source.kind === "material") return "materials";
  if (source.kind === "sprite") return "sprites";
  return "models";
}

interface FetchPackResult {
  outDir: string;
  models: number;
  textures: number;
  url: string;
}

function describeFetchResult(source: AssetSource, result: FetchPackResult): string {
  if (source.kind === "material") {
    return `pulled ${result.textures} material map(s) -> ${result.outDir}`;
  }
  if (source.kind === "sprite") {
    return `pulled ${result.models} sprite/icon file(s) -> ${result.outDir}`;
  }
  const textureNote = result.textures > 0 ? ` + ${result.textures} texture(s)` : "";
  return `pulled ${result.models} models${textureNote} -> ${result.outDir}`;
}

async function fetchPackInto(
  source: AssetSource,
  outRoot: string,
  options: { mirrorBase?: string | undefined },
): Promise<FetchPackResult> {
  const outDir = join(outRoot, packSubdir(source), source.id);
  console.log(
    `resolving ${source.id}${isScrapeDownload(source.download) ? " (scrape)" : ""}` +
      `${options.mirrorBase !== undefined ? ` [mirror override: ${options.mirrorBase}]` : ""}…`,
  );
  const { archive, url, attempted } = await downloadPackArchive(source, {
    mirrorBase: options.mirrorBase,
    fetchImpl: cliFetch,
  });
  console.log(
    `downloaded ${url}${attempted.length > 1 ? ` (after ${attempted.length - 1} failed attempt(s))` : ""}`,
  );
  if (source.kind === "material") {
    const maps = extractMaterialMaps(archive);
    if (maps.every((map) => map.role !== "color")) {
      fail(`no color map found in ${source.id} archive`);
    }
    const missing = source.materialMaps?.filter((role) => !maps.some((map) => map.role === role)) ?? [];
    if (missing.length > 0) fail(`${source.id} archive is missing declared material map(s): ${missing.join(", ")}`);
    mkdirSync(outDir, { recursive: true });
    for (const map of maps) writeFileSync(join(outDir, map.file), map.bytes);
    return { outDir, models: 0, textures: maps.length, url };
  }
  if (source.kind === "sprite") {
    const files = extractSpriteFiles(archive, source.spriteLayout ?? "flat");
    if (files.length === 0) fail(`no .svg/.png files found in ${source.id} archive`);
    for (const file of files) {
      const target = join(outDir, ...file.file.split("/"));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.bytes);
    }
    return { outDir, models: files.length, textures: 0, url };
  }
  const { models, images } = extractGlbs(archive);
  if (models.length === 0) fail(`no .glb files found in ${source.id} archive`);
  mkdirSync(outDir, { recursive: true });
  for (const glb of models) writeFileSync(join(outDir, glb.file), glb.bytes);
  for (const image of images) writeFileSync(join(outDir, image.file), image.bytes);
  return { outDir, models: models.length, textures: images.length, url };
}

function readSingles(): SingleAsset[] {
  if (!existsSync(singlesJson)) return [];
  return JSON.parse(readFileSync(singlesJson, "utf8")) as SingleAsset[];
}

function writeSingles(list: SingleAsset[]): void {
  writeFileSync(singlesJson, `${JSON.stringify(list, null, 2)}\n`);
}

function cmdRegisterSingle(argv: string[]): void {
  const target = argv[0];
  if (target === undefined) {
    fail("usage: register <path|url> --category <c> --license <l> [--author <a>] [--id <id>]");
  }
  const license = flag(argv, "license");
  if (license === undefined) fail("add requires --license");
  const author = flag(argv, "author") ?? "Unknown";
  const categories = (flag(argv, "categories") ?? flag(argv, "category") ?? "prop")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const isUrl = /^https?:\/\//i.test(target);
  let url: string;
  let id: string;
  if (isUrl) {
    url = target;
    id = flag(argv, "id") ?? `single/${basename(new URL(target).pathname).replace(/\.glb$/i, "")}`;
  } else {
    const abs = resolve(target);
    if (!existsSync(abs)) fail(`local file not found: ${abs}`);
    mkdirSync(localDir, { recursive: true });
    const file = basename(abs);
    copyFileSync(abs, join(localDir, file));
    url = `${CDN_BASE}/${file}`;
    id = flag(argv, "id") ?? `single/${file.replace(/\.glb$/i, "")}`;
  }

  const singles = readSingles();
  if (singles.some((single) => single.id === id)) fail(`single already exists: ${id}`);
  singles.push({ id, url, license, author, categories });
  writeSingles(singles);
  console.log(`added single ${id} -> ${url}${isUrl ? " (0 bytes stored)" : " (copied to local/)"}`);
}

const KINDS: readonly AssetKind[] = [
  "model",
  "pack",
  "material",
  "component",
  "icon",
  "sprite",
  "spritePack",
];

async function performAdd(match: AssetMatch, argv: string[]): Promise<void> {
  if (match.kind === "component") {
    const component = registryCatalog.components.find((entry) => entry.name === match.name);
    if (component === undefined) fail(`component vanished from catalog: ${match.name}`);
    console.log(`component: ${component.title} — ${component.description}\n`);
    console.log(componentWiringSnippet(component));
    return;
  }
  if (match.kind === "icon") {
    console.log(`icon: ${match.name}\n`);
    console.log(iconWiringSnippet(match.name));
    return;
  }

  const outRoot = flag(argv, "dir") !== undefined ? resolve(flag(argv, "dir")!) : resolveDefaultOutputRoot(here);
  const mirrorBase = flag(argv, "mirror") ?? process.env["JGENGINE_ASSETS_MIRROR"];

  if (match.kind === "material") {
    const source = sourceById.get(match.id);
    if (source === undefined) fail(`match resolves to unknown source: ${match.id}`);
    const outDir = join(outRoot, "materials", match.id);
    if (dirHasEntries(outDir)) {
      console.log(`${match.id} already present in ${outDir}`);
    } else {
      const result = await fetchPackInto(source, outRoot, { mirrorBase });
      console.log(describeFetchResult(source, result));
    }
    console.log(`\nwire it in:\n`);
    console.log(materialWiringSnippet(match.id));
    return;
  }

  if (match.kind === "sprite" || match.kind === "spritePack") {
    const source = sourceById.get(match.source);
    if (source === undefined) fail(`match resolves to unknown source: ${match.source}`);
    const outDir = join(outRoot, "sprites", match.source);

    if (dirHasEntries(outDir)) {
      console.log(`${match.source} already present in ${outDir}`);
    } else {
      const result = await fetchPackInto(source, outRoot, { mirrorBase });
      console.log(describeFetchResult(source, result));
    }

    const result = reindexSprites(join(outRoot, "sprites"), generatedSpritesDir);
    console.log(`reindexed ${result.total} entries -> ${generatedSpritesDir}`);

    if (match.kind === "sprite") {
      console.log(`\nwire it in:\n`);
      console.log(spriteWiringSnippet(match.id));
    } else {
      console.log(
        `\n${match.title}: browse ids with \`assets list --kind sprite --source ${match.source}\`, then wire like:\n`,
      );
      console.log(spriteWiringSnippet(`${match.source}/<icon>`));
    }
    return;
  }

  const source = sourceById.get(match.source);
  if (source === undefined) fail(`match resolves to unknown source: ${match.source}`);
  const outDir = join(outRoot, "models", match.source);

  if (dirHasEntries(outDir)) {
    console.log(`${match.source} already present in ${outDir}`);
  } else {
    const result = await fetchPackInto(source, outRoot, { mirrorBase });
    console.log(describeFetchResult(source, result));
  }

  const result = reindex(join(outRoot, "models"), generatedDir);
  console.log(`reindexed ${result.total} entries -> ${generatedDir}`);

  if (match.kind === "model") {
    console.log(`\nwire it in (characters/enemies go in entityModels instead):\n`);
    console.log(modelWiringSnippet(match.id));
  } else {
    console.log(
      `\n${match.title}: browse ids with \`assets list --source ${match.source}\`, then wire like:\n`,
    );
    console.log(modelWiringSnippet(`${match.source}/<model>`));
  }
}

async function cmdAdd(argv: string[]): Promise<void> {
  const query = argv[0];
  if (query === undefined) {
    fail(
      "usage: add <query> [--kind model|pack|material|component|icon|sprite|spritePack] [--dir <dir>] [--mirror <baseUrl>] [--json]\n" +
        "       add <path|url> --license <l> [--category <c>]   (register a one-off single into the shipped index)",
    );
  }
  // Back-compat: the old `add` registered a one-off single, always with --license.
  if (flag(argv, "license") !== undefined) {
    cmdRegisterSingle(argv);
    return;
  }

  const kindFlag = flag(argv, "kind");
  if (kindFlag !== undefined && !KINDS.includes(kindFlag as AssetKind)) {
    fail(`--kind must be one of ${KINDS.join(", ")}`);
  }
  const kind = kindFlag as AssetKind | undefined;
  const ranked = rankAssets(query, { kind, limit: Number(flag(argv, "limit") ?? "12") });
  if (ranked.length === 0) {
    fail(`no asset matches "${query}" — try a broader term, or \`jgengine find <words>\``);
  }
  if (argv.includes("--json")) {
    console.log(JSON.stringify(ranked, null, 2));
    return;
  }

  const top = ranked[0]!;
  const runnerUp = ranked[1]?.score ?? 0;
  const decisive = ranked.length === 1 || kind !== undefined || top.score - runnerUp >= 20;
  if (!decisive) {
    console.log(`several matches for "${query}" — narrow with --kind or a more specific term:\n`);
    for (const entry of ranked.slice(0, 8)) console.log(`  ${describeAssetMatch(entry.match)}`);
    console.log(`\nthen re-run, e.g. \`assets add "${query}" --kind ${top.match.kind}\``);
    return;
  }
  console.log(`→ ${describeAssetMatch(top.match)}\n`);
  await performAdd(top.match, argv);
}

function cmdBudget(argv: string[]): void {
  const target = argv[0];
  if (target === undefined || target.startsWith("--")) {
    fail("usage: budget <file|directory> [--max-bytes <n>] [--max-triangles <n>] [--max-texture-dimension <n>] [--json]");
  }
  const budget: AssetBudget = {};
  const limits = {
    "--max-bytes": "maxBytes",
    "--max-triangles": "maxTriangles",
    "--max-texture-dimension": "maxTextureDimension",
  } as const;
  for (let index = 1; index < argv.length; index += 1) {
    const option = argv[index]!;
    if (option === "--json") continue;
    const key = limits[option as keyof typeof limits];
    if (key === undefined) fail(`unknown budget option: ${option}`);
    const raw = argv[++index];
    if (raw === undefined || !/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
      fail(`${option} requires a non-negative safe integer`);
    }
    if (budget[key] !== undefined) fail(`duplicate budget option: ${option}`);
    budget[key] = Number(raw);
  }
  try {
    const report = createAssetBudgetReport(target, budget);
    if (argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
    else {
      for (const entry of report.entries) {
        const metrics = entry.metrics;
        const detail = metrics === undefined ? "unreadable"
          : `${metrics.byteLength} bytes, ${metrics.triangles} triangles, ${metrics.maxTextureDimension}px max texture`;
        console.log(`${entry.file}: ${detail}`);
      }
      for (const error of report.errors) console.error(`error: ${error}`);
      console.log(`budget: ${report.ok ? "ok" : "failed"} (${report.entries.length} models)`);
    }
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

function cmdReindex(argv: string[]): void {
  const modelsDir = resolve(argv[0] ?? resolveDefaultReindexDir(here, "models"));
  if (!existsSync(modelsDir)) fail(`models dir not found: ${modelsDir}`);
  const result = reindex(modelsDir, generatedDir);
  for (const row of result.perSource) console.log(`  ${row.source}: ${row.count}`);
  console.log(`reindexed ${result.total} entries -> ${generatedDir}`);
}

function cmdReindexSprites(argv: string[]): void {
  const spritesDir = resolve(argv[0] ?? resolveDefaultReindexDir(here, "sprites"));
  if (!existsSync(spritesDir)) fail(`sprites dir not found: ${spritesDir}`);
  const result = reindexSprites(spritesDir, generatedSpritesDir);
  for (const row of result.perSource) console.log(`  ${row.source}: ${row.count}`);
  console.log(`reindexed ${result.total} entries -> ${generatedSpritesDir}`);
}

function cmdVerify(): void {
  const result = verifyManifest();
  if (result.ok) {
    console.log("verify: ok");
    return;
  }
  for (const error of result.errors) console.error(`  ✗ ${error}`);
  fail(`verify failed with ${result.errors.length} problem(s)`);
}

/**
 * Resolve each id against the provisioning contract and print its owner —
 * `committed`, `provisioned` (with the `assets pull <source>` step), or
 * `dangling`. Exits non-zero if any id is dangling, so a clean-clone gate can
 * feed it logical ids and fail on references no source or single owns.
 */
function cmdProvenance(argv: string[]): void {
  const ids = argv.filter((arg) => !arg.startsWith("--"));
  if (ids.length === 0) fail("usage: assets provenance <id> [<id>...]");
  const references = ids.map((id) => ({ consumer: "cli", id }));
  const result = validateAssetReferences(references);
  for (const row of result.results) {
    const p = row.provenance;
    const detail =
      p.kind === "provisioned"
        ? `${p.resolvedPath}  (${p.provisioningStep})`
        : p.kind === "committed"
          ? `${p.resolvedPath}`
          : "no owner";
    const mark = row.ok ? "✓" : "✗";
    console.log(`  ${mark} ${p.id}: ${p.kind} — ${detail}`);
  }
  if (result.provisioning.length > 0) {
    console.log(`provisioning steps: ${result.provisioning.join(", ")}`);
  }
  if (!result.ok) fail(`provenance: ${result.errors.length} dangling reference(s)`);
  console.log("provenance: ok");
}

if (import.meta.main) {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case "find":
      await cmdFind(rest);
      break;
    case "list":
      cmdList(rest);
      break;
    case "pull":
      await cmdPull(rest).catch((error: unknown) => fail(describeNetworkFailure(error)));
      break;
    case "add":
      await cmdAdd(rest).catch((error: unknown) => fail(describeNetworkFailure(error)));
      break;
    case "register":
      cmdRegisterSingle(rest);
      break;
    case "budget":
      cmdBudget(rest);
      break;
    case "reindex":
      cmdReindex(rest);
      break;
    case "reindex-sprites":
      cmdReindexSprites(rest);
      break;
    case "verify":
      cmdVerify();
      break;
    case "provenance":
      cmdProvenance(rest);
      break;
    case "library":
      await cmdLibrary(rest, join(packageTreeRoot, "library", "generated"), fail).catch((error: unknown) => fail(describeNetworkFailure(error)));
      break;
    default:
      console.log(
        "usage: assets <find|add|list|pull|register|reindex|reindex-sprites|budget|verify|provenance|library> [...args]\n" +
        "  assets library search \"iron sword\" --kind icon   # the shared asset library; pull a key with: assets pull <key>\n" +
        "  assets find raptor \"street lamp\" --game games/my-game   # many names at once, JSON out\n" +
        "  assets pull starter   # every pack the starter catalog needs, into ./public/models",
      );
      if (command !== undefined && command !== "help") process.exit(1);
  }
}
