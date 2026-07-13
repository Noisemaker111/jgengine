#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { downloadPackArchive, extractGlbs, extractTextures } from "../download";
import { type AssetKind, type AssetMatch, rankAssets } from "../find";
import { generatedIndex } from "../generated";
import { reindex } from "../indexGen";
import { isScrapeDownload, type AssetSource, type SingleAsset } from "../manifest";
import { extractMaterialMaps } from "../materials";
import { registryCatalog } from "../registry";
import {
  componentWiringSnippet,
  iconWiringSnippet,
  materialWiringSnippet,
  modelWiringSnippet,
} from "../snippet";
import { materialSources, sourceById } from "../sources";
import { verifyManifest } from "../verify";
import { resolveGeneratedDir, resolvePackageRoot, resolvePackageTreeRoot } from "./paths";

const here = dirname(fileURLToPath(import.meta.url));
const packageTreeRoot = resolvePackageTreeRoot(here);
const pkgRoot = resolvePackageRoot(here);
/** Sibling of `cli/` under `src/` (dev) or `dist/` (published) so reindex writes the tree consumers import. */
export const generatedDir = resolveGeneratedDir(here);
export { resolveGeneratedDir } from "./paths";
const singlesJson = join(packageTreeRoot, "singles.json");
const localDir = join(pkgRoot, "local");
const CDN_BASE = "https://cdn.jsdelivr.net/gh/Noisemaker111/jgengine@main/packages/assets/local";

export function flag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

/**
 * The runtime's own fetch, with a curl fallback for hosts it cannot reach —
 * some proxied sandboxes tear down bun's TLS stream to GitHub's release-asset
 * host while curl (which honors SSL_CERT_FILE) gets through fine.
 */
export const cliFetch: typeof fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  try {
    return await fetch(input, init);
  } catch (error) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (init?.method !== undefined && init.method !== "GET") throw error;
    try {
      const bytes = execFileSync("curl", ["-fsSL", "--max-time", "600", url], {
        maxBuffer: 1024 * 1024 * 1024,
      });
      return new Response(new Uint8Array(bytes));
    } catch {
      throw error;
    }
  }
}) as typeof fetch;

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

function cmdSearch(argv: string[]): void {
  const term = argv[0];
  if (term === undefined) fail("usage: search <term>");
  const needle = term.toLowerCase();
  const limit = Number(flag(argv, "limit") ?? "50");
  const rows = generatedIndex.filter(
    (entry) =>
      entry.id.toLowerCase().includes(needle) || entry.file.toLowerCase().includes(needle),
  );
  for (const entry of rows.slice(0, limit)) {
    console.log(`${entry.id}\t[${entry.categories.join(",")}]\t${entry.file}`);
  }
  console.log(`— ${Math.min(rows.length, limit)} of ${rows.length} matches for "${term}"`);
}

export function isPopulated(dir: string): boolean {
  return existsSync(dir) && readdirSync(dir).length > 0;
}

export async function cmdPull(argv: string[]): Promise<void> {
  const sourceId = argv[0];
  if (sourceId === undefined) {
    fail("usage: pull <source-id> [--dir <dir>] [--mirror <baseUrl>] [--offline]");
  }
  const source = sourceById.get(sourceId);
  if (source === undefined) fail(`unknown source: ${sourceId}`);

  const outRoot = resolve(flag(argv, "dir") ?? "public");
  const outDir = join(outRoot, source.kind === "material" ? "materials" : "models", sourceId);
  const offline = argv.includes("--offline");
  const mirrorBase = flag(argv, "mirror") ?? process.env.JGENGINE_ASSETS_MIRROR;

  if (offline) {
    if (!isPopulated(outDir)) {
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
  const textureNote = result.textures > 0 ? ` + ${result.textures} texture(s)` : "";
  return `pulled ${result.models} models${textureNote} -> ${result.outDir}`;
}

async function fetchPackInto(
  source: AssetSource,
  outRoot: string,
  options: { mirrorBase?: string },
): Promise<FetchPackResult> {
  const isMaterial = source.kind === "material";
  const outDir = join(outRoot, isMaterial ? "materials" : "models", source.id);
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
  if (isMaterial) {
    const maps = extractMaterialMaps(archive);
    if (maps.every((map) => map.role !== "color")) {
      fail(`no color map found in ${source.id} archive`);
    }
    mkdirSync(outDir, { recursive: true });
    for (const map of maps) writeFileSync(join(outDir, map.file), map.bytes);
    return { outDir, models: 0, textures: maps.length, url };
  }
  const glbs = extractGlbs(archive);
  if (glbs.length === 0) fail(`no .glb files found in ${source.id} archive`);
  mkdirSync(outDir, { recursive: true });
  for (const glb of glbs) writeFileSync(join(outDir, glb.file), glb.bytes);
  const textures = extractTextures(archive);
  for (const texture of textures) {
    const dest = join(outDir, texture.file);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, texture.bytes);
  }
  return { outDir, models: glbs.length, textures: textures.length, url };
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

const KINDS: readonly AssetKind[] = ["model", "pack", "material", "component", "icon"];

function describeMatch(match: AssetMatch): string {
  switch (match.kind) {
    case "model":
      return `[model]     ${match.id}${match.via === "alias" ? "  (alias)" : match.via === "single" ? "  (single)" : ""}`;
    case "pack":
      return `[pack]      ${match.source} — ${match.title}`;
    case "material":
      return `[material]  ${match.id} — ${match.title}`;
    case "component":
      return `[component] ${match.name} — ${match.title}`;
    case "icon":
      return `[icon]      ${match.name}`;
  }
}

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

  const outRoot = resolve(flag(argv, "dir") ?? "public");
  const mirrorBase = flag(argv, "mirror") ?? process.env.JGENGINE_ASSETS_MIRROR;

  if (match.kind === "material") {
    const source = sourceById.get(match.id);
    if (source === undefined) fail(`match resolves to unknown source: ${match.id}`);
    const outDir = join(outRoot, "materials", match.id);
    if (isPopulated(outDir)) {
      console.log(`${match.id} already present in ${outDir}`);
    } else {
      const result = await fetchPackInto(source, outRoot, { mirrorBase });
      console.log(describeFetchResult(source, result));
    }
    console.log(`\nwire it in:\n`);
    console.log(materialWiringSnippet(match.id));
    return;
  }

  const source = sourceById.get(match.source);
  if (source === undefined) fail(`match resolves to unknown source: ${match.source}`);
  const outDir = join(outRoot, "models", match.source);

  if (isPopulated(outDir)) {
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
      "usage: add <query> [--kind model|pack|material|component|icon] [--dir <dir>] [--mirror <baseUrl>] [--json]\n" +
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
    fail(`no asset matches "${query}" — try a broader term or \`assets search <term>\``);
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
    for (const entry of ranked.slice(0, 8)) console.log(`  ${describeMatch(entry.match)}`);
    console.log(`\nthen re-run, e.g. \`assets add "${query}" --kind ${top.match.kind}\``);
    return;
  }
  console.log(`→ ${describeMatch(top.match)}\n`);
  await performAdd(top.match, argv);
}

function cmdReindex(argv: string[]): void {
  const modelsDir = resolve(argv[0] ?? join("public", "models"));
  if (!existsSync(modelsDir)) fail(`models dir not found: ${modelsDir}`);
  const result = reindex(modelsDir, generatedDir);
  for (const row of result.perSource) console.log(`  ${row.source}: ${row.count}`);
  console.log(`reindexed ${result.total} entries -> ${generatedDir}`);
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

if (import.meta.main) {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case "list":
      cmdList(rest);
      break;
    case "search":
      cmdSearch(rest);
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
    case "reindex":
      cmdReindex(rest);
      break;
    case "verify":
      cmdVerify();
      break;
    default:
      console.log("usage: assets <add|list|search|pull|register|reindex|verify> [...args]");
      if (command !== undefined && command !== "help") process.exit(1);
  }
}
