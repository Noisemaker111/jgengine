import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { assetStoreRoot } from "../../packages/assets/src/assetStore";

/**
 * Every downloaded table the importer reads, with its licence. Raw files live in the shared asset
 * store (`<main checkout>/.asset-store/plant-sources/`), fetched once per machine, never committed.
 * Only public-domain, CC0, MIT or CC BY sources are allowed.
 */
export interface RawSource {
  /** Path under `plant-sources/`. */
  file: string;
  url: string;
  licence: string;
  /** Extract a downloaded zip into the file's folder. */
  unzip?: boolean;
}

const FIA = "https://apps.fs.usda.gov/fia/datamart/CSV/";
const FVS = "https://raw.githubusercontent.com/USDAForestService/ForestVegetationSimulator/main/";

export function fiaSiteTrees(state: string): RawSource {
  return { file: `fia/${state}_SITETREE.csv`, url: `${FIA}${state}_SITETREE.csv`, licence: "US public domain (USDA Forest Service FIA)" };
}

export const FIA_SPECIES: RawSource = { file: "fia/REF_SPECIES.csv", url: `${FIA}REF_SPECIES.csv`, licence: "US public domain (USDA Forest Service FIA)" };
export const FVS_LS_HEIGHT: RawSource = { file: "fvs/ls_htcalc.f", url: `${FVS}ls/htcalc.f`, licence: "US public domain (FVS license.txt)" };
export const FVS_LS_CROWN: RawSource = { file: "fvs/ls_cwcalc.f", url: `${FVS}ls/cwcalc.f`, licence: "US public domain (FVS license.txt)" };
export const TALLO: RawSource = { file: "tallo/Tallo.csv", url: "https://zenodo.org/api/records/6637599/files/Tallo.csv/content", licence: "CC BY 4.0 (Jucker et al. 2022)" };
export const BAAD: RawSource = {
  file: "baad/x/baad_data/baad_data.csv",
  url: "https://github.com/dfalster/baad/releases/download/v1.0.1/baad_data.zip",
  licence: "CC0 data (Falster et al. 2015)",
  unzip: true,
};

/** The raw store folder: `plant-sources/` in the shared asset store. */
export function rawStore(repoRoot: string): string {
  return join(assetStoreRoot(repoRoot), "plant-sources");
}

/** Download `source` into the store unless it is there; returns its path. */
export function ensureRaw(repoRoot: string, source: RawSource): string {
  const path = join(rawStore(repoRoot), source.file);
  if (existsSync(path)) return path;
  mkdirSync(dirname(path), { recursive: true });
  const target = source.unzip ? join(rawStore(repoRoot), dirname(source.file.split("/x/")[0] ?? source.file), "download.zip") : path;
  mkdirSync(dirname(target), { recursive: true });
  console.error(`plants: downloading ${source.url} (${source.licence})`);
  const got = spawnSync("curl", ["-sSfL", "-m", "600", "-o", target, source.url], { stdio: "inherit" });
  if (got.status !== 0) throw new Error(`download failed: ${source.url}`);
  if (source.unzip) {
    const folder = join(dirname(target), "x");
    mkdirSync(folder, { recursive: true });
    const tar = process.platform === "win32" ? "C:\\Windows\\System32\\tar.exe" : "tar";
    const out = spawnSync(tar, ["-xf", target, "-C", folder], { stdio: "inherit" });
    if (out.status !== 0) throw new Error(`unzip failed: ${target}`);
  }
  if (!existsSync(path)) throw new Error(`${source.file} missing after download`);
  return path;
}

/** A raw source's text, downloading it first if needed. */
export function readRaw(repoRoot: string, source: RawSource): string {
  return readFileSync(ensureRaw(repoRoot, source), "latin1");
}
