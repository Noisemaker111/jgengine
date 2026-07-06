#!/usr/bin/env bun
/**
 * JGengine Assets CLI
 *
 * Commands:
 *   init [dir]          Copy starter asset catalog and download a curated starter set.
 *   pull <pack-id> ...  Download specific Kenney/Quaternius packs into [dir].
 *   list                List all available packs.
 *
 * The default output directory is ./public/models relative to cwd.
 */

import { mkdir, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { kenneyPackById, kenneyPacks } from "../sources/kenney";
import type { AssetPack, PullResult } from "../manifest";

const DEFAULT_OUTPUT_DIR = resolve(process.cwd(), "public/models");

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  return res.text();
}

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  return res.arrayBuffer();
}

/**
 * Scrape a Kenney asset page to find the direct ZIP download URL.
 */
function scrapeKenneyZipUrl(html: string): string | null {
  // Look for the "Continue without donating" link or any .zip href
  const match = html.match(/href="([^"]+\.zip)"/);
  if (match === null) return null;
  let url = match[1];
  if (url.startsWith("/")) url = `https://kenney.nl${url}`;
  return url;
}

async function downloadZip(url: string, destPath: string): Promise<void> {
  const buffer = await fetchBuffer(url);
  await Bun.write(destPath, buffer);
}

function platformUnzip(zipPath: string, outDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === "win32";
    const cmd = isWin
      ? ["powershell", "-Command", `Expand-Archive -Path "${zipPath}" -DestinationPath "${outDir}" -Force`]
      : ["unzip", "-q", "-o", zipPath, "-d", outDir];

    Bun.spawn(cmd, {
      stdout: "ignore",
      stderr: "ignore",
      onExit(_proc, exitCode, _signalCode, error) {
        if (error) {
          reject(error);
        } else if (exitCode !== 0) {
          reject(new Error(`unzip exited with code ${exitCode}`));
        } else {
          resolve();
        }
      },
    });
  });
}

async function copyGlbsFromExtracted(extractedDir: string, glbPath: string, outputDir: string): Promise<{ downloaded: number; skipped: number }> {
  const sourceDir = join(extractedDir, glbPath);
  const entries = await readdir(sourceDir).catch(() => []);
  const glbFiles = entries.filter((f) => f.toLowerCase().endsWith(".glb"));

  let downloaded = 0;
  let skipped = 0;

  await mkdir(outputDir, { recursive: true });

  for (const file of glbFiles) {
    const src = join(sourceDir, file);
    const dest = join(outputDir, file);
    const destFile = Bun.file(dest);
    if (await destFile.exists()) {
      skipped += 1;
      continue;
    }
    await Bun.write(dest, Bun.file(src));
    downloaded += 1;
  }

  return { downloaded, skipped };
}

async function pullPack(pack: AssetPack, outputDir: string): Promise<PullResult> {
  console.log(`📦 ${pack.name} (${pack.source})`);

  const zipUrl = pack.downloadUrl ?? scrapeKenneyZipUrl(await fetchText(pack.sourceUrl));
  if (zipUrl === null) {
    throw new Error(`Could not find download URL for ${pack.id}. The page layout may have changed.`);
  }

  const tmpDir = join(process.cwd(), ".jgengine-assets-tmp", pack.id);
  const zipPath = join(tmpDir, "pack.zip");

  await mkdir(tmpDir, { recursive: true });

  console.log(`   ↓ Downloading…`);
  await downloadZip(zipUrl, zipPath);

  console.log(`   📂 Extracting…`);
  await platformUnzip(zipPath, tmpDir);

  const packOutputDir = join(outputDir, pack.id);
  const { downloaded, skipped } = await copyGlbsFromExtracted(tmpDir, pack.zipGlbPath, packOutputDir);

  // Cleanup
  await Bun.spawn(["rm", "-rf", tmpDir], { stdout: "ignore", stderr: "ignore" }).exited.catch(() => undefined);
  if (process.platform === "win32") {
    await Bun.spawn(["powershell", "-Command", `Remove-Item -Recurse -Force "${tmpDir}"`], { stdout: "ignore", stderr: "ignore" }).exited.catch(() => undefined);
  }

  console.log(`   ✓ ${downloaded} new, ${skipped} skipped → ${packOutputDir}`);

  return { packId: pack.id, downloaded, skipped, outputDir: packOutputDir };
}

function printUsage(): void {
  console.log(`
Usage: jgengine-assets <command> [options]

Commands:
  init [dir]                Download starter packs to [dir] (default: public/models)
  pull <pack-id> ...        Download specific packs
  list                      List all available packs

Examples:
  npx @jgengine/assets init
  npx @jgengine/assets pull kenney-nature kenney-weapon-pack
`);
}

async function listPacks(): Promise<void> {
  console.log("\nAvailable packs:\n");
  for (const pack of kenneyPacks) {
    const cats = pack.categories.join(", ");
    console.log(`  ${pack.id.padEnd(36)} ${pack.name} (~${pack.modelCount} models) [${cats}]`);
  }
  console.log("\nUse: npx @jgengine/assets pull <pack-id> ...\n");
}

const STARTER_PACKS = [
  "kenney-nature",
  "kenney-weapon-pack",
  "kenney-survival-kit",
  "kenney-furniture-kit",
  "kenney-food-kit",
];

async function initStarter(outputDir: string): Promise<void> {
  console.log("\n🚀 Downloading starter asset set…\n");
  for (const packId of STARTER_PACKS) {
    const pack = kenneyPackById.get(packId);
    if (pack === undefined) {
      console.warn(`Unknown pack: ${packId}`);
      continue;
    }
    try {
      await pullPack(pack, outputDir);
    } catch (error) {
      console.error(`Failed to pull ${packId}:`, error instanceof Error ? error.message : error);
    }
  }
  console.log("\n✅ Starter assets ready.\n");
  console.log(`Register them in your game:\n`);
  console.log(`  import { createStarterCatalog } from "@jgengine/assets/catalogs/starter";`);
  console.log(`  const assets = createStarterCatalog("/models");\n`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "list") {
    await listPacks();
    return;
  }

  if (command === "init") {
    const dir = args[1] ? resolve(args[1]) : DEFAULT_OUTPUT_DIR;
    await initStarter(dir);
    return;
  }

  if (command === "pull") {
    const packIds = args.slice(1).filter((a) => !a.startsWith("-"));
    const dirArgIndex = args.indexOf("--dir");
    const dir = dirArgIndex >= 0 && args[dirArgIndex + 1] ? resolve(args[dirArgIndex + 1]!) : DEFAULT_OUTPUT_DIR;

    if (packIds.length === 0) {
      console.error("Error: No pack IDs specified.");
      printUsage();
      process.exit(1);
    }

    for (const packId of packIds) {
      const pack = kenneyPackById.get(packId);
      if (pack === undefined) {
        console.error(`Unknown pack: ${packId}. Run 'list' to see available packs.`);
        continue;
      }
      try {
        await pullPack(pack, dir);
      } catch (error) {
        console.error(`Failed to pull ${packId}:`, error instanceof Error ? error.message : error);
      }
    }
    return;
  }

  printUsage();
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
