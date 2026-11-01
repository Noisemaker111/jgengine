import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { gunzipSync } from "fflate";

import { FONT_DIR, fontFileName, fontOriginPath, fontOriginUrl, fontOf, FONT_LIBRARY } from "./fontLibrary";
import { HDRI_DIR, HDRI_LIBRARY, hdriFileName, hdriOf, hdriOriginUrl } from "./hdriLibrary";
import { LUT_GRADES, LUT_GRADE_DIR, lutGradeFile, lutGradeFileName, lutGradeOf } from "./lutGrades";

/** The three curated looks that are files a game serves. */
export type CuratedKind = "hdri" | "lut" | "font";

/** One curated file to serve: what it is, its id and the folder under `public/` that holds it. */
export interface CuratedJob {
  kind: CuratedKind;
  id: string;
  /** Folder relative to `public/`, one per id, e.g. `hdri/library/golden-hour`. */
  dir: string;
  /** Pull target the CLI takes: `look:hdri/golden-hour`. */
  target: string;
}

const GITHUB_PACKS = "https://github.com/Noisemaker111/jgengine/releases/download/packs";

const CALLS: Record<CuratedKind, RegExp> = {
  hdri: /hdriEnvironment\(\s*["'`]([a-z0-9-]+)["'`]/g,
  lut: /lutGrade\(\s*["'`]([a-z0-9-]+)["'`]/g,
  font: /libraryFont(?:Pairing)?\(([^)]*)\)/g,
};

const DIRS: Record<CuratedKind, string> = { hdri: HDRI_DIR, lut: LUT_GRADE_DIR, font: FONT_DIR };

function job(kind: CuratedKind, id: string): CuratedJob {
  return { kind, id, dir: `${DIRS[kind]}/${id}`, target: `look:${kind}/${id}` };
}

/** Every curated look a game's source names through `hdriEnvironment`, `lutGrade`, `libraryFont` or `libraryFontPairing`. */
export function curatedJobsIn(text: string): CuratedJob[] {
  const found = new Map<string, CuratedJob>();
  for (const match of text.matchAll(CALLS.hdri)) if (match[1] !== undefined && HDRI_LIBRARY.some((entry) => entry.id === match[1])) found.set(`hdri/${match[1]}`, job("hdri", match[1]));
  for (const match of text.matchAll(CALLS.lut)) if (match[1] !== undefined && LUT_GRADES.some((entry) => entry.id === match[1])) found.set(`lut/${match[1]}`, job("lut", match[1]));
  for (const match of text.matchAll(CALLS.font)) {
    for (const id of (match[1] ?? "").matchAll(/["'`]([a-z0-9-]+)["'`]/g)) {
      if (id[1] !== undefined && FONT_LIBRARY.some((entry) => entry.id === id[1])) found.set(`font/${id[1]}`, job("font", id[1]));
    }
  }
  return [...found.values()];
}

/** Parses a `look:<kind>/<id>` pull target. Returns undefined for any other target. */
export function parseLookTarget(target: string): { kind: CuratedKind; id: string } | undefined {
  const match = /^look:(hdri|lut|font)\/([a-z0-9-]+)$/.exec(target);
  return match === null ? undefined : { kind: match[1] as CuratedKind, id: match[2] ?? "" };
}

/** Name of the file in the `packs` release that mirrors a curated binary, e.g. `look-hdri-golden-hour.hdr`. */
export function lookMirrorName(kind: CuratedKind, id: string): string {
  if (kind === "hdri") return `look-hdri-${hdriOf(id).id}.hdr`;
  if (kind === "font") return `look-font-${fontOf(id).id}.woff2`;
  return `look-lut-${lutGradeOf(id).id}.cube`;
}

/** The served path under `public/` of a curated file. */
export function lookServedPath(kind: CuratedKind, id: string): string {
  if (kind === "hdri") return `${HDRI_DIR}/${hdriFileName(id)}`;
  if (kind === "font") return `${FONT_DIR}/${fontFileName(id)}`;
  return `${LUT_GRADE_DIR}/${lutGradeFileName(id)}`;
}

/** Reads one file out of an uncompressed ustar archive. */
export function untarFile(tar: Uint8Array, path: string): Uint8Array {
  let offset = 0;
  const text = (from: number, length: number): string => new TextDecoder().decode(tar.subarray(from, from + length)).replace(/\0.*$/s, "");
  while (offset + 512 <= tar.length) {
    const name = text(offset, 100);
    if (name === "") break;
    const size = parseInt(text(offset + 124, 12).trim() || "0", 8);
    if (name === path) return tar.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error(`${path} is not in the archive`);
}

async function bytesOf(fetchImpl: typeof fetch, url: string): Promise<Uint8Array> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** What {@link pullCuratedLook} needs from its caller. */
export interface CuratedPullContext {
  /** The `public/`-shaped root to write into (a game's `public/` or the shared asset store). */
  outRoot: string;
  fetchImpl?: typeof fetch;
  /** Base URL of the `packs` release mirror; default is this repository's. A mirror miss falls back to the origin. */
  mirrorBase?: string;
  log?: (line: string) => void;
}

/**
 * Writes one curated look to `ctx.outRoot`: a grade is baked locally, an HDRI comes from the packs
 * mirror (else Poly Haven's 2K file) and a font from the mirror (else its pinned Fontsource npm tarball).
 */
export async function pullCuratedLook(kind: CuratedKind, id: string, ctx: CuratedPullContext): Promise<string> {
  const fetchImpl = ctx.fetchImpl ?? fetch;
  const path = join(ctx.outRoot, ...lookServedPath(kind, id).split("/"));
  mkdirSync(dirname(path), { recursive: true });
  if (kind === "lut") {
    writeFileSync(path, lutGradeFile(id));
    return path;
  }
  const mirrorUrl = `${ctx.mirrorBase ?? GITHUB_PACKS}/${lookMirrorName(kind, id)}`;
  try {
    writeFileSync(path, await bytesOf(fetchImpl, mirrorUrl));
    ctx.log?.(`${kind}/${id}: from ${mirrorUrl}`);
    return path;
  } catch (error) {
    ctx.log?.(`${kind}/${id}: mirror miss (${error instanceof Error ? error.message : String(error)}), using the origin`);
  }
  if (kind === "hdri") {
    writeFileSync(path, await bytesOf(fetchImpl, hdriOriginUrl(id)));
  } else {
    const tar = gunzipSync(await bytesOf(fetchImpl, fontOriginUrl(id)));
    writeFileSync(path, untarFile(tar, fontOriginPath(id)));
  }
  return path;
}
