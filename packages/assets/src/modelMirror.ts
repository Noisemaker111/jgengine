import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { unzipSync, zipSync } from "fflate";

import { libraryModelDir } from "./catalogs/modelLibrary";
import { boundedExtractFilter, DEFAULT_RELEASE_BASE, downloadArchive, mirrorOverrideBase } from "./download";

/** Sidecar written into a mirror zip: what the pull returned, so a mirror hit reports the same numbers. */
const RESULT_FILE = "pulled.json";

/** `model-library-<name>.zip`, the release asset holding one per-model pull exactly as it lands in the store. */
export function modelMirrorAssetName(name: string): string {
  return `model-library-${name.replace(/\//g, "-")}.zip`;
}

/** Every base URL to try for a per-model zip, in order: `JGENGINE_ASSETS_MIRROR`, then the default release (unless disabled). */
export function modelMirrorUrls(name: string, env: Readonly<Record<string, string | undefined>> = process.env): string[] {
  const urls: string[] = [];
  const override = mirrorOverrideBase(env);
  if (override !== undefined) urls.push(`${override}/model-library/${name.replace(/\//g, "-")}.zip`);
  if (env["JGENGINE_ASSETS_NO_DEFAULT_MIRROR"] !== "1") urls.push(`${DEFAULT_RELEASE_BASE}/${modelMirrorAssetName(name)}`);
  return urls;
}

/**
 * Restore a per-model pull from the mirror into `<modelsRoot>/library/<name>/`. Returns the pull's
 * recorded result and folder, or null when no mirror holds a usable zip, so the caller falls back to the source.
 */
export async function pullMirroredModel<T>(
  name: string,
  modelsRoot: string,
  fetchImpl: typeof fetch,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<{ recorded: T; dir: string } | null> {
  for (const url of modelMirrorUrls(name, env)) {
    try {
      const files = unzipSync(await downloadArchive(url, fetchImpl), { filter: boundedExtractFilter(() => true) });
      const recorded = files[RESULT_FILE];
      if (recorded === undefined) continue;
      const dir = join(modelsRoot, ...libraryModelDir(name).split("/"));
      mkdirSync(dir, { recursive: true });
      for (const [file, bytes] of Object.entries(files)) {
        if (file === RESULT_FILE || file.includes("/") || file.includes("\\") || file.startsWith(".")) continue;
        writeFileSync(join(dir, file), bytes);
      }
      return { recorded: JSON.parse(new TextDecoder().decode(recorded)) as T, dir };
    } catch {
      // Missing, blocked or malformed: the next mirror, then the source.
    }
  }
  return null;
}

/** Zip a pulled model folder with the pull's result, ready to upload as {@link modelMirrorAssetName}. */
export function zipPulledModel(dir: string, result: object): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const file of readdirSync(dir)) files[file] = readFileSync(join(dir, file));
  files[RESULT_FILE] = new TextEncoder().encode(JSON.stringify(result));
  return zipSync(files);
}
