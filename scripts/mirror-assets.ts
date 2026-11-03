// Mirrors every catalog pack into the `packs` release. The release itself is read, created and
// uploaded to through gh (`gh api`, `gh release`), the one way repo tooling reaches GitHub; the packs
// are fetched from their own hosts by @jgengine/assets' pulls, the same code a user's pull runs.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveGithubToken } from "../packages/assets/src/cli/githubToken";
import { lookMirrorName, lookServedPath, pullCuratedLook } from "../packages/assets/src/catalogs/curatedPull";
import { FONT_LIBRARY } from "../packages/assets/src/catalogs/fontLibrary";
import { HDRI_LIBRARY } from "../packages/assets/src/catalogs/hdriLibrary";
import { MODEL_LIBRARY, libraryModelDir } from "../packages/assets/src/catalogs/modelLibrary";
import { fetchSourceArchive } from "../packages/assets/src/download";
import { pullLibraryModel } from "../packages/assets/src/modelLibraryPull";
import { modelMirrorAssetName, zipPulledModel } from "../packages/assets/src/modelMirror";
import { pullRocketboxModel } from "../packages/assets/src/rocketboxPull";
import { sources } from "../packages/assets/src/sources";
import type { AssetSource } from "../packages/assets/src/manifest";
import { ghCli, type GhRun } from "./github";

const TAG = "packs";
const repo = process.env["GITHUB_REPOSITORY"] ?? "Noisemaker111/jgengine";
const gh = ghCli();

function ghOk(args: string[]): string {
  const run: GhRun = gh(args);
  if (run.status !== 0) throw new Error(`gh ${args.slice(0, 2).join(" ")} failed: ${(run.stderr || run.stdout).trim()}`);
  return run.stdout;
}

/** The names already in the `packs` release, creating the release when it does not exist yet. */
function mirroredNames(): Set<string> {
  const release = gh(["api", `repos/${repo}/releases/tags/${TAG}`, "--jq", ".id"]);
  if (release.status !== 0) {
    if (!/HTTP 404/.test(release.stderr)) throw new Error(`reading the ${TAG} release failed: ${release.stderr.trim()}`);
    ghOk([
      "release",
      "create",
      TAG,
      "--repo",
      repo,
      "--title",
      "Asset packs",
      "--notes",
      "Mirror of the CC0/CC-BY asset packs in packages/assets/src/sources. Each zip keeps its original license files. Synced by .github/workflows/mirror-assets.yml.",
    ]);
    return new Set();
  }
  const names = ghOk(["api", "--paginate", `repos/${repo}/releases/${release.stdout.trim()}/assets?per_page=100`, "--jq", ".[].name"]);
  return new Set(names.split("\n").map((name) => name.trim()).filter((name) => name.length > 0));
}

function isPriority(source: AssetSource): boolean {
  const kind = source.kind ?? "model";
  return kind === "model" || kind === "sprite";
}

/** `gh release upload` names the asset after the file, so the bytes are written under `assetName` first. */
function upload(assetName: string, bytes: Uint8Array): void {
  const dir = mkdtempSync(join(tmpdir(), "jg-upload-"));
  try {
    const file = join(dir, assetName);
    writeFileSync(file, bytes);
    ghOk(["release", "upload", TAG, file, "--repo", repo]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const have = mirroredNames();
let uploaded = 0;
const softFailures: string[] = [];
const hardFailures: string[] = [];
const unpulledFailures: string[] = [];

for (const source of sources) {
  const assetName = `${source.provider}-${source.id}.zip`;
  if (have.has(assetName)) continue;
  try {
    const { archive, url } = await fetchSourceArchive(source);
    upload(assetName, archive);
    uploaded += 1;
    console.log(`mirrored ${assetName} (${(archive.byteLength / 1_048_576).toFixed(1)} MB) from ${url}`);
  } catch (error) {
    const line = `${assetName}: ${error instanceof Error ? error.message : String(error)}`;
    if (source.unpulled !== undefined) unpulledFailures.push(`${line} (unpulled: ${source.unpulled})`);
    else if (isPriority(source)) hardFailures.push(line);
    else softFailures.push(line);
  }
}

// Per-model pulls (Rocketbox, Khronos) read api.github.com, which cloud sandboxes cannot reach, so each
// is built here from the real source (blob-sha verified by the pull) and shipped as one zip. The pull
// is @jgengine/assets' own, with the token it resolves for any user's pull.
process.env["JGENGINE_ASSETS_NO_DEFAULT_MIRROR"] = "1";
const githubToken = resolveGithubToken();
const modelFailures: string[] = [];
const modelOnly = process.env["MIRROR_MODEL_ONLY"];
for (const entry of MODEL_LIBRARY) {
  const provider = entry.origin.provider;
  if (provider !== "rocketbox" && provider !== "khronos") continue;
  if (modelOnly !== undefined && modelOnly !== "" && modelOnly !== entry.name) continue;
  const assetName = modelMirrorAssetName(entry.name);
  if (have.has(assetName)) continue;
  const scratch = mkdtempSync(join(tmpdir(), "jg-mirror-"));
  try {
    const options = { modelsRoot: scratch, ...(githubToken === undefined ? {} : { githubToken }) };
    const pulled = provider === "rocketbox" ? await pullRocketboxModel(entry, options) : await pullLibraryModel(entry, options);
    const { name: _name, ...recorded } = pulled;
    const archive = zipPulledModel(join(scratch, ...libraryModelDir(entry.name).split("/")), recorded);
    upload(assetName, new Uint8Array(archive));
    uploaded += 1;
    console.log(`mirrored ${assetName} (${(archive.byteLength / 1_048_576).toFixed(1)} MB) from ${provider}`);
  } catch (error) {
    modelFailures.push(`${assetName}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
// Curated HDRIs and fonts (`catalogs/hdriLibrary.ts`, `fontLibrary.ts`) are single files named `look-<kind>-<id>.<ext>`.
const lookFailures: string[] = [];
for (const [kind, ids] of [["hdri", HDRI_LIBRARY.map((entry) => entry.id)], ["font", FONT_LIBRARY.map((entry) => entry.id)]] as const) {
  for (const id of ids) {
    const assetName = lookMirrorName(kind, id);
    if (have.has(assetName)) continue;
    const scratch = mkdtempSync(join(tmpdir(), "jg-mirror-"));
    try {
      await pullCuratedLook(kind, id, { outRoot: scratch, mirrorBase: "http://127.0.0.1:9/none" });
      const file = readFileSync(join(scratch, ...lookServedPath(kind, id).split("/")));
      upload(assetName, new Uint8Array(file));
      uploaded += 1;
      console.log(`mirrored ${assetName} (${(file.byteLength / 1_048_576).toFixed(1)} MB)`);
    } catch (error) {
      lookFailures.push(`${assetName}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
}
for (const failure of lookFailures) console.error(`  - ${failure}`);
hardFailures.push(...lookFailures);
for (const failure of modelFailures) console.error(`  - ${failure}`);
hardFailures.push(...modelFailures);

console.log(
  `mirror-assets: ${sources.length} catalog packs, ${have.size} already mirrored, ${uploaded} uploaded, ${hardFailures.length} hard fails, ${softFailures.length} soft fails (materials), ${unpulledFailures.length} unpulled`,
);
for (const failure of unpulledFailures) console.warn(`  ? ${failure}`);
for (const failure of softFailures) console.warn(`  ~ ${failure}`);
for (const failure of hardFailures) console.error(`  - ${failure}`);
// Materials 404s (stale ambientCG ids) and packs the catalog already records as `unpulled` must not block model/sprite mirroring.
if (hardFailures.length > 0) process.exit(1);
