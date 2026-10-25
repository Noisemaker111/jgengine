/**
 * Every GLB a game ships resolves its textures where the GLB is served.
 *
 *   bun run games:check-glb-textures
 *
 * A GLB names its textures by URL, and the browser resolves a relative one against the URL the
 * GLB itself came from. A texture 404 does not fail the model load - the GLB parses, the meshes
 * draw, and only the map is missing - so a broken reference ships as an untextured prop and
 * nothing in the build notices. Harbor Heat's far planter did exactly that: `planter-far.glb` is
 * served from `src/art/` but named `Flowers.png` beside it, while the file ships in the
 * provisioned pack under `public/models/`, so every far planter past 60 m drew untextured and the
 * run logged "texture/sub-resource loads failed".
 *
 * The rule, in the two shapes a reference can take:
 *   * `src/` GLBs are bundled: Vite copies them under a hashed `assets/` URL, so a relative
 *     texture cannot resolve to anything. They must use a served path (`/models/...`) or embed
 *     the image in the GLB.
 *   * `public/` GLBs are served from their own directory, so a relative texture must be a sibling
 *     file that exists; an absolute one is resolved from `public/`.
 * In both cases the file the browser would fetch must exist under the game's `public/`.
 *
 * Provisioned packs are a precondition, as they are for the game's own boot: `bun run games:provision`
 * runs before this in CI, and a missing pack is reported with that command rather than silently
 * skipped - a skip is what let the untextured far planter through.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import type { Dirent } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

import { gameDirs } from "./capabilities";

/** One texture reference that cannot be served, and what the browser would have asked for. */
export interface TextureProblem {
  game: string;
  /** Game-relative path of the GLB holding the reference, forward slashes. */
  glb: string;
  /** The `images[].uri` exactly as the GLB names it. */
  texture: string;
  /** Where that reference lands under `public/`, or why it cannot be resolved at all. */
  target: string;
  reason: string;
}

export interface CheckResult {
  problems: TextureProblem[];
  /** GLBs inspected, and texture references found, so a silent zero is visible in the log. */
  glbs: number;
  textures: number;
  lines: string[];
}

export interface Io {
  readGlbJson(path: string): { images?: { uri?: string }[] };
  exists(path: string): boolean;
}

export const realIo: Io = {
  readGlbJson(path) {
    const bytes = readFileSync(path);
    if (bytes.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path}: not a GLB`);
    const jsonLength = bytes.readUInt32LE(12);
    return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
  },
  exists: existsSync,
};

const toPosix = (path: string): string => path.replaceAll(sep, "/");

/**
 * Where the browser fetches `uri` from, given the GLB's own game-relative path. Returns the
 * `public/`-relative target, or a reason it cannot resolve to one.
 */
export function resolveTexture(glb: string, uri: string): { target: string } | { reason: string } {
  if (uri.startsWith("data:")) return { target: "" };
  if (uri.startsWith("/")) return { target: uri.slice(1) };
  if (!glb.startsWith("public/")) {
    return {
      reason:
        "a bundled GLB is served from a hashed URL, so a relative texture resolves to nothing - name the served path (/models/...) or embed the image",
    };
  }
  return { target: toPosix(join(dirname(glb.slice("public/".length)), uri)) };
}

/** Every tracked GLB a game ships, as game-relative forward-slash paths. */
export function glbsIn(root: string, game: string): string[] {
  const found: string[] = [];
  for (const sub of ["src", "public"]) {
    const dir = join(root, game, sub);
    if (!existsSync(dir)) continue;
    const walk = (at: string): void => {
      for (const entry of readdirSync(at, { withFileTypes: true }) as Dirent[]) {
        const path = join(at, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "node_modules") walk(path);
        } else if (entry.name.endsWith(".glb")) {
          found.push(toPosix(relative(join(root, game), path)));
        }
      }
    };
    walk(dir);
  }
  return found.sort();
}

/**
 * Inspect one GLB. `exists` is the `public/`-relative file probe, so a test can hand in a map
 * instead of a provisioned tree.
 */
export function inspectGlb(
  root: string,
  game: string,
  glb: string,
  io: Io = realIo,
): { problems: TextureProblem[]; textures: number } {
  const problems: TextureProblem[] = [];
  const json = io.readGlbJson(join(root, game, glb));
  const images = json.images ?? [];
  for (const image of images) {
    const uri = image.uri;
    if (uri === undefined) continue;
    const resolved = resolveTexture(glb, uri);
    if ("reason" in resolved) {
      problems.push({ game, glb, texture: uri, target: "-", reason: resolved.reason });
      continue;
    }
    if (resolved.target === "") continue;
    if (io.exists(join(root, game, "public", resolved.target))) continue;
    problems.push({
      game,
      glb,
      texture: uri,
      target: resolved.target,
      reason: `no such file under public/ - the browser requests it and gets a 404 (run \`bun run games:provision ${game}\` if the pack is not pulled)`,
    });
  }
  return { problems, textures: images.filter((image) => image.uri !== undefined).length };
}

export function checkGlbTextures(root: string, games: string[], io: Io = realIo): CheckResult {
  const problems: TextureProblem[] = [];
  let glbs = 0;
  let textures = 0;
  for (const game of games) {
    for (const glb of glbsIn(root, game)) {
      glbs += 1;
      const inspected = inspectGlb(root, game, glb, io);
      problems.push(...inspected.problems);
      textures += inspected.textures;
    }
  }
  const lines: string[] = [];
  for (const problem of problems) {
    lines.push(`glb-textures: FAIL - ${problem.game}/${problem.glb} names "${problem.texture}" -> ${problem.target}`);
    lines.push(`  ${problem.reason}`);
  }
  lines.push(
    problems.length === 0
      ? `glb-textures: OK - ${textures} texture reference${textures === 1 ? "" : "s"} in ${glbs} GLBs all resolve`
      : `glb-textures: FAIL - ${problems.length} texture reference${problems.length === 1 ? "" : "s"} cannot be served`,
  );
  return { problems, glbs, textures, lines };
}

export function runCli(argv: string[], root: string, log: (line: string) => void): number {
  const at = argv.indexOf("--root");
  const target = at >= 0 ? (argv[at + 1] ?? root) : root;
  const result = checkGlbTextures(target, gameDirs(target), realIo);
  for (const line of result.lines) log(line);
  return result.problems.length === 0 ? 0 : 1;
}

if (import.meta.main) process.exit(runCli(process.argv.slice(2), process.cwd(), console.log));
