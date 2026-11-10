import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { brotliCompressSync, constants as zlib } from "node:zlib";

import { gamePublicDirs, listPublicFiles } from "../apps/dev/gamePublicPlugin";
import { headRevision } from "./captureRevision";
import { checkoutIdentity, SERVER_IDENTITY_PATH, type ServerIdentityReport } from "./devServerMarker";
import { treeFingerprint } from "./servedTree";

/**
 * The build players get, for the perf harness: the game runner built the way the web deploy builds it
 * (`apps/dev`'s `vite build`: minified, bundled, production React, no dev-server plugins; the site
 * runs the same build with `--base /play/`), served from this process. The desktop app wraps a
 * `vite build` of the same sources.
 *
 * A build is kept under the hash of what the tree serves ({@link treeFingerprint}) and of the asset
 * files linked into the games' `public/` folders, so the same files are built once and an edit, or a
 * pack provisioned since, builds again: a build bakes in each game's file list, and one made before a
 * game's packs were linked answers 404 for every model and texture. Source maps are written beside the chunks without a
 * `sourceMappingURL` comment (`--sourcemap hidden`), so the bytes a page downloads are the deploy's
 * and a profile's minified frames can still be named by package (`scripts/perf-scorecard.ts`).
 */

/** Which build a perf run measures: what players get, or the Vite dev server agents iterate on. */
export type PerfBuild = "production" | "dev";

const BUILD_ROOT = join(".scratch", "perf-prod");
const BUILT_MARKER = ".built.json";
/** Builds kept per checkout: the current one and the one before it (an A/B across an edit). */
const KEEP_BUILDS = 2;
/** Brotli level the static files are compressed at once, at build time: about what a CDN serves. */
const BROTLI_QUALITY = 9;
const COMPRESSED = new Set([".js", ".css", ".html", ".json", ".svg", ".wasm", ".txt", ".gltf"]);

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ktx2": "image/ktx2",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

export interface ProdBuild {
  /** The folder the build was written to; chunks under `assets/`, each with its `.map`. */
  outDir: string;
  fingerprint: string;
  /** Seconds the build took, or 0 when an earlier build of the same files was reused. */
  buildSeconds: number;
}

function compressTree(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    // Each game's own public/ is models and textures, hard links into the shared asset store: never written beside.
    if (entry.isDirectory()) {
      if (entry.name !== "games" && entry.name !== "models" && entry.name !== "materials") compressTree(path);
      continue;
    }
    if (!COMPRESSED.has(extname(entry.name).toLowerCase())) continue;
    const bytes = readFileSync(path);
    if (bytes.length < 1024) continue;
    writeFileSync(`${path}.br`, brotliCompressSync(bytes, { params: { [zlib.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY, [zlib.BROTLI_PARAM_SIZE_HINT]: bytes.length } }));
  }
}

/** One hash of every file name under the runner's and each game's `public/`: what a build copies beside its chunks. */
function publicFilesHash(root: string): string {
  const hash = createHash("sha1");
  const dirs = [["", join(root, "apps", "dev", "public")], ...gamePublicDirs(undefined, join(root, "games"))] as const;
  for (const [game, dir] of dirs) hash.update([game, ...listPublicFiles(dir), ""].join("\n"));
  return hash.digest("hex").slice(0, 8);
}

/**
 * Build (or reuse) the production runner for the files `cwd` serves now. Link the asset packs of the
 * games to be measured first (`provisionCapturedGame`). Throws with the build's log path when it fails.
 */
export function buildProdRunner(cwd: string): ProdBuild {
  const root = resolve(cwd);
  const registries = join(root, "apps", "dev", "src", "registries.tsx");
  if (existsSync(registries) && readFileSync(registries, "utf8").includes('"!**/main.tsx"')) {
    throw new Error(`the production build of ${root} mounts every game twice and never becomes playable: its apps/dev/src/registries.tsx is from before the game-source glob was fixed. Measure that commit with --dev, or a checkout of it with the fix (the exclusions spelled "!../../../games/*/src/**/main.tsx")`);
  }
  const fingerprint = `${treeFingerprint(root)}-${publicFilesHash(root)}`;
  const buildRoot = join(root, BUILD_ROOT);
  const outDir = join(buildRoot, fingerprint);
  if (existsSync(join(outDir, BUILT_MARKER))) return { outDir, fingerprint, buildSeconds: 0 };
  mkdirSync(buildRoot, { recursive: true });
  const kept = readdirSync(buildRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, at: statSync(join(buildRoot, entry.name)).mtimeMs }))
    .sort((a, b) => b.at - a.at);
  for (const old of kept.slice(KEEP_BUILDS - 1)) rmSync(join(buildRoot, old.name), { recursive: true, force: true, maxRetries: 3 });
  const startedAt = Date.now();
  console.error(`perf: building the production runner for ${fingerprint} (about a minute; reused until the served files change)`);
  const log = join(buildRoot, `${fingerprint}.build.log`);
  const built = spawnSync(process.execPath, ["x", "vite", "build", "--sourcemap", "hidden", "--outDir", outDir, "--emptyOutDir", "--logLevel", "warn"], {
    cwd: join(root, "apps", "dev"),
    encoding: "utf8",
    windowsHide: true,
    timeout: 540_000,
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, NODE_ENV: "production" },
  });
  writeFileSync(log, `${built.stdout ?? ""}\n${built.stderr ?? ""}`);
  if (built.status !== 0 || !existsSync(join(outDir, "index.html"))) {
    rmSync(outDir, { recursive: true, force: true, maxRetries: 3 });
    throw new Error(`the production build of ${root} failed (exit ${built.status ?? "none"}); its output is in ${log}`);
  }
  compressTree(outDir);
  const buildSeconds = Math.round((Date.now() - startedAt) / 1000);
  writeFileSync(join(outDir, BUILT_MARKER), `${JSON.stringify({ fingerprint, head: headRevision(root) ?? null, builtAt: new Date().toISOString(), buildSeconds })}\n`);
  console.error(`perf: production runner built in ${buildSeconds} s at ${outDir}`);
  return { outDir, fingerprint, buildSeconds };
}

/** The file a request path names under a build, never outside it; `/` is the runner's page. */
export function prodFile(outDir: string, pathname: string): string | null {
  let path: string;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (path.includes("\0")) return null;
  const base = resolve(outDir);
  const file = resolve(base, `.${path === "/" ? "/index.html" : path}`);
  if (file !== base && !file.startsWith(base + sep)) return null;
  if (file.endsWith(".map") || file.endsWith(".br") || file.endsWith(BUILT_MARKER)) return null;
  return existsSync(file) && statSync(file).isFile() ? file : null;
}

export interface ProdServer {
  child: null;
  port: number;
  base: string;
  build: ProdBuild;
  stop(): void;
}

/**
 * Build the production runner for `cwd` and serve it from this process on a free port, brotli where a
 * CDN would compress. It answers the identity route the dev server answers, so a run still proves
 * which checkout its numbers describe.
 */
export function ensureProdServer(cwd: string): ProdServer {
  const build = buildProdRunner(cwd);
  const root = checkoutIdentity(cwd);
  const identity: ServerIdentityReport & { build: PerfBuild; fingerprint: string } = {
    identity: root, root, gameDir: null, pid: process.pid, kind: "runner", head: headRevision(cwd), build: "production", fingerprint: build.fingerprint,
  };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === SERVER_IDENTITY_PATH) return Response.json(identity, { headers: { "cache-control": "no-store" } });
      const file = prodFile(build.outDir, url.pathname);
      if (file === null) return new Response("not found", { status: 404 });
      const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
      // Hashed chunks are immutable, as on the deploy; the page itself is always asked for again.
      const cache = url.pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
      const brotli = (request.headers.get("accept-encoding") ?? "").includes("br") && existsSync(`${file}.br`);
      return new Response(Bun.file(brotli ? `${file}.br` : file), {
        headers: { "content-type": type, "cache-control": cache, ...(brotli ? { "content-encoding": "br", vary: "accept-encoding" } : {}) },
      });
    },
  });
  const port = server.port;
  if (port === undefined) throw new Error("the production runner's server did not get a port");
  return { child: null, port, base: `http://127.0.0.1:${port}`, build, stop: () => void server.stop(true) };
}
