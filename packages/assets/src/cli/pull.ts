#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { downloadPackArchive, extractGlbs, extractTextures } from "../download";
import { generatedIndex } from "../generated";
import { reindex } from "../indexGen";
import { isScrapeDownload, type SingleAsset } from "../manifest";
import { sourceById } from "../sources";
import { verifyManifest } from "../verify";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..", "..");
const srcDir = join(pkgRoot, "src");
const generatedDir = join(srcDir, "generated");
const singlesJson = join(srcDir, "singles.json");
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

function cmdList(argv: string[]): void {
  const category = flag(argv, "category");
  const source = flag(argv, "source");
  const limit = Number(flag(argv, "limit") ?? "50");
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
  const outDir = join(outRoot, "models", sourceId);
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

  console.log(
    `resolving ${sourceId}${isScrapeDownload(source.download) ? " (scrape)" : ""}` +
      `${mirrorBase !== undefined ? ` [mirror override: ${mirrorBase}]` : ""}…`,
  );
  const { archive, url, attempted } = await downloadPackArchive(source, { mirrorBase });
  console.log(
    `downloaded ${url}${attempted.length > 1 ? ` (after ${attempted.length - 1} failed attempt(s))` : ""}`,
  );

  const glbs = extractGlbs(archive);
  if (glbs.length === 0) fail(`no .glb files found in ${sourceId} archive`);
  mkdirSync(outDir, { recursive: true });
  for (const glb of glbs) writeFileSync(join(outDir, glb.file), glb.bytes);

  const textures = extractTextures(archive);
  for (const texture of textures) {
    const dest = join(outDir, texture.file);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, texture.bytes);
  }

  const textureNote = textures.length > 0 ? ` + ${textures.length} texture(s)` : "";
  console.log(`pulled ${glbs.length} models${textureNote} -> ${outDir}`);
}

function readSingles(): SingleAsset[] {
  if (!existsSync(singlesJson)) return [];
  return JSON.parse(readFileSync(singlesJson, "utf8")) as SingleAsset[];
}

function writeSingles(list: SingleAsset[]): void {
  writeFileSync(singlesJson, `${JSON.stringify(list, null, 2)}\n`);
}

function cmdAdd(argv: string[]): void {
  const target = argv[0];
  if (target === undefined) fail("usage: add <path|url> --category <c> --license <l> [--author <a>] [--id <id>]");
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
      await cmdPull(rest);
      break;
    case "add":
      cmdAdd(rest);
      break;
    case "reindex":
      cmdReindex(rest);
      break;
    case "verify":
      cmdVerify();
      break;
    default:
      console.log("usage: assets <list|search|pull|add|reindex|verify> [...args]");
      if (command !== undefined && command !== "help") process.exit(1);
  }
}
