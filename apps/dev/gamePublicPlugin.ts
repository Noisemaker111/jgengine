import { copyFileSync, createReadStream, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, dirname, extname, join, normalize, resolve, sep } from "node:path";

import type { Plugin, ViteDevServer } from "vite";

import { assetStoreRoot } from "../../packages/assets/src/assetStore";
import { gameAssetText, LIBRARY_PULL_ROUTE, libraryPullMiddleware } from "../../games/shared/provisionAssets";
import { compressedVariant, textureVariantDir } from "../../games/shared/textureVariants";
import { prefetchTier, type PrefetchItem } from "../../packages/core/src/boot/prefetchTier";

const TYPES: Readonly<Record<string, string>> = {
  ".gltf": "model/gltf+json",
  ".glb": "model/gltf-binary",
  ".bin": "application/octet-stream",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".exr": "application/octet-stream",
  ".ktx2": "image/ktx2",
  ".json": "application/json",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".hdr": "application/octet-stream",
};

/** The folder under the runner's base that serves one game's own `public/` files: `games/<id>/`. */
export const GAME_PUBLIC_FOLDER = "games";

/** The module the runner imports for a game's file list: `gamePublicFiles[id]()` resolves to its paths. */
export const GAME_PUBLIC_MODULE = "virtual:jgengine-game-public";

/**
 * Every game's own `public/` folder by game id: each `games/<id>` the runner can load, with the
 * `--game-dir` game replacing the in-repo copy of the same id. A game's provisioned models and
 * pulled packs live there, never in the runner's own `public/`.
 */
export function gamePublicDirs(servedGameDir: string | undefined, gamesDir: string): Map<string, string> {
  const dirs = new Map<string, string>();
  if (existsSync(gamesDir)) {
    for (const entry of readdirSync(gamesDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (!existsSync(join(gamesDir, entry.name, "src", "index.tsx"))) continue;
      const pub = join(gamesDir, entry.name, "public");
      if (existsSync(pub)) dirs.set(entry.name, pub);
    }
  }
  if (servedGameDir !== undefined && servedGameDir !== "" && existsSync(join(servedGameDir, "public"))) {
    dirs.set(basename(resolve(servedGameDir)), join(servedGameDir, "public"));
  }
  return dirs;
}

/** Every file under a game's `public/`, as the root-absolute path the game asks for (`/models/a.glb`), links followed. */
export function listPublicFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (abs: string, rel: string): void => {
    // walk-ok: a game's public/ folder is the asset tree being listed, not a source search
    for (const name of readdirSync(abs).sort()) {
      const path = join(abs, name);
      const stat = statSync(path, { throwIfNoEntry: false });
      if (stat === undefined) continue;
      if (stat.isDirectory()) walk(path, `${rel}/${name}`);
      else if (stat.isFile()) out.push(`${rel}/${name}`);
    }
  };
  if (existsSync(dir)) walk(dir, "");
  return out;
}

/**
 * The file a request path names under one root, never escaping it. With a `variantDir` (the asset
 * store's KTX2 cache, `games/shared/textureVariants.ts`), a model or image that has a GPU-compressed
 * twin there is answered with the twin.
 */
export function resolvePublicFile(url: string, root: string, variantDir?: string): string | null {
  const [target = ""] = url.split("#", 1);
  const query = target.indexOf("?");
  const search = query < 0 ? "" : target.slice(query + 1);
  const path = decodeURIComponent(query < 0 ? target : target.slice(0, query));
  if (!path.startsWith("/") || path.includes("\0")) return null;
  const relative = normalize(path.slice(1));
  if (relative.startsWith("..") || relative === ".") return null;
  const base = resolve(root);
  const file = resolve(base, relative);
  if (file === base || !file.startsWith(base + sep)) return null;
  if (!existsSync(file) || !statSync(file).isFile()) return null;
  return (variantDir === undefined ? null : compressedVariant(file, search, variantDir)) ?? file;
}

/** A root-absolute asset path written as a string in a game's source or scene: `"/models/a/b.glb"`. */
const ASSET_LITERAL = /["'`](\/[A-Za-z0-9_][A-Za-z0-9_./ -]*\.(?:glb|gltf|bin|png|jpe?g|webp|ktx2|hdr|exr|mp3|ogg|wav|m4a))["'`]/g;

/** Every root-absolute asset path a game's text names. */
export function assetLiterals(text: string): string[] {
  return [...new Set(captures(text, ASSET_LITERAL))].sort();
}

/** The first capture group of every match of a global pattern. */
function captures(text: string, pattern: RegExp): string[] {
  const found: string[] = [];
  for (const [, capture] of text.matchAll(pattern)) if (capture !== undefined) found.push(capture);
  return found;
}

/** The `uri` of each entry in a glTF `buffers` or `images` array. */
function entryUris(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const uris: string[] = [];
  for (const entry of list) {
    if (typeof entry === "object" && entry !== null && "uri" in entry && typeof entry.uri === "string") uris.push(entry.uri);
  }
  return uris;
}

function modelJson(file: string): string {
  const bytes = readFileSync(file);
  // A .glb is a 12-byte header then chunks; its first chunk (length at 12, type at 16) is the glTF JSON.
  if (bytes.length >= 20 && bytes.toString("latin1", 0, 4) === "glTF") return bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12));
  return bytes.toString("utf8");
}

function foldDots(path: string): string {
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "..") out.pop();
    else if (part !== ".") out.push(part);
  }
  return out.join("/");
}

/** The files a `.gltf` or `.glb` loads beside itself (buffers and images it names by path), as root-absolute paths. */
export function modelSiblings(path: string, file: string): string[] {
  try {
    const doc: unknown = JSON.parse(modelJson(file));
    if (typeof doc !== "object" || doc === null) return [];
    const dir = path.slice(0, path.lastIndexOf("/") + 1);
    return [...entryUris("buffers" in doc ? doc.buffers : undefined), ...entryUris("images" in doc ? doc.images : undefined)]
      .filter((uri) => !uri.startsWith("data:") && !/^[a-z]+:/i.test(uri))
      .map((uri) => foldDots(`${dir}${decodeURIComponent(uri)}`));
  } catch {
    return [];
  }
}

/**
 * The files one game names, in the order the runner fetches them when the game opens: every
 * asset path its source or scene writes out, the library models and material packs it names by id,
 * and the files a `.gltf` among them loads, near versions before distance and LOD versions. Files
 * a pack holds that the game never names are left out, so opening a game never downloads a pack.
 */
export function gamePrefetchList(text: string, gameFiles: readonly string[], sharedFiles: ReadonlySet<string>, fileOf: (path: string) => string | null): PrefetchItem[] {
  const own = new Set(gameFiles);
  const paths: string[] = [];
  for (const path of assetLiterals(text)) if (own.has(path) || sharedFiles.has(path)) paths.push(path);
  const quoted = new Set(captures(text, /["'`]([A-Za-z0-9_./-]+)["'`]/g));
  for (const path of [...own, ...sharedFiles]) {
    const library = /^\/models\/library\/(.+)\/[^/]+$/.exec(path)?.[1];
    const material = /^\/materials\/([^/]+)\/[^/]+$/.exec(path)?.[1];
    if ((library !== undefined && quoted.has(library)) || (material !== undefined && quoted.has(material))) paths.push(path);
  }
  const all = [...paths];
  for (const path of paths) {
    if (!path.endsWith(".gltf") && !path.endsWith(".glb")) continue;
    const file = fileOf(path);
    if (file !== null) all.push(...modelSiblings(path, file).filter((sibling) => own.has(sibling) || sharedFiles.has(sibling)));
  }
  return [...new Set(all)].map((path) => ({ path, tier: prefetchTier(path) }));
}

/** A `/games/<id>/<path>` request split into the game and the path that game asked for. */
export function splitGamePublicUrl(url: string): { game: string; path: string } | null {
  const [, game, path] = new RegExp(`^/${GAME_PUBLIC_FOLDER}/([^/?#]+)(/[^#]*)$`).exec(url) ?? [];
  return game === undefined || path === undefined ? null : { game: decodeURIComponent(game), path };
}

/**
 * Write every game's `public/` into a production runner build at `<outDir>/games/<id>/`, the folder
 * {@link GAME_PUBLIC_MODULE} points the game at. Files are hard-linked where the volume allows (the
 * shared asset store is large), copied otherwise.
 */
export function writeGamePublics(outDir: string, dirs: ReadonlyMap<string, string>): number {
  let written = 0;
  for (const [game, dir] of dirs) {
    for (const path of listPublicFiles(dir)) {
      const from = join(dir, ...path.split("/"));
      const to = join(outDir, GAME_PUBLIC_FOLDER, game, ...path.split("/"));
      mkdirSync(dirname(to), { recursive: true });
      try {
        linkSync(from, to);
      } catch {
        copyFileSync(from, to);
      }
      written += 1;
    }
  }
  return written;
}

/** The runner module that lists each game's own files and what to fetch when it opens, one lazy chunk per game. */
export function gamePublicIndexModule(games: readonly string[]): string {
  const entries = games.map((game) => `  ${JSON.stringify(game)}: () => import(${JSON.stringify(`${GAME_PUBLIC_MODULE}/${game}`)}),`);
  return `export const GAME_PUBLIC_FOLDER = ${JSON.stringify(GAME_PUBLIC_FOLDER)};\nexport const gamePublic = {\n${entries.join("\n")}\n};\n`;
}

/**
 * The in-repo game folder the editor's asset library pulls into when the runner hosts `game`, or
 * undefined for an unknown game or one served from another checkout (`games:provision` takes an
 * in-repo game name).
 */
export function libraryPullGameDir(dirs: ReadonlyMap<string, string>, gamesDir: string, game: string | undefined): string | undefined {
  const pub = game === undefined ? undefined : dirs.get(game);
  if (pub === undefined) return undefined;
  const gameDir = dirname(pub);
  return resolve(dirname(gameDir)) === resolve(gamesDir) ? gameDir : undefined;
}

/**
 * Serves each game's own `public/` to the runner under `games/<id>/`, in dev from the game's folder
 * and in a production build as files written next to the bundle, and gives the runner each game's
 * file list (`virtual:jgengine-game-public`) so a game's `/models/…` resolves to its own copy.
 */
export function gamePublicPlugin(servedGameDir: string | undefined, gamesDir: string): Plugin {
  const dirs = gamePublicDirs(servedGameDir, gamesDir);
  const variantDir = textureVariantDir(assetStoreRoot(dirname(resolve(gamesDir))));
  let outDir = "";
  let runnerPublic = "";
  let server: ViteDevServer | undefined;
  const resolvedIndex = `\0${GAME_PUBLIC_MODULE}`;
  return {
    name: "jgengine-game-public",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
      runnerPublic = config.publicDir;
    },
    resolveId(id) {
      if (id === GAME_PUBLIC_MODULE || id.startsWith(`${GAME_PUBLIC_MODULE}/`)) return `\0${id}`;
      return null;
    },
    load(id) {
      if (id === resolvedIndex) return gamePublicIndexModule([...dirs.keys()]);
      if (!id.startsWith(`${resolvedIndex}/`)) return;
      const dir = dirs.get(id.slice(resolvedIndex.length + 1));
      const files = dir === undefined ? [] : listPublicFiles(dir);
      const prefetch = dir === undefined ? [] : gamePrefetchList(gameAssetText(dirname(dir)), files, new Set(listPublicFiles(runnerPublic)), (path) =>
        resolvePublicFile(path, dir) ?? resolvePublicFile(path, runnerPublic));
      return `export const files = ${JSON.stringify(files)};
export const prefetch = ${JSON.stringify(prefetch)};
`;
    },
    configureServer(devServer) {
      server = devServer;
      // A pack provisioned while the server runs joins the game's list on the next page load.
      devServer.watcher.add([...dirs.values()]);
      const refresh = (file: string): void => {
        for (const [game, dir] of dirs) {
          if (!resolve(file).startsWith(resolve(dir) + sep)) continue;
          const module = server?.moduleGraph.getModuleById(`${resolvedIndex}/${game}`);
          if (module !== undefined) server?.moduleGraph.invalidateModule(module);
        }
      };
      devServer.watcher.on("add", refresh);
      devServer.watcher.on("unlink", refresh);
      devServer.middlewares.use(LIBRARY_PULL_ROUTE, libraryPullMiddleware((game) => libraryPullGameDir(dirs, gamesDir, game)));
      devServer.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        const split = splitGamePublicUrl(req.url ?? "");
        const dir = split === null ? undefined : dirs.get(split.game);
        const file = split === null || dir === undefined ? null : resolvePublicFile(split.path, dir, variantDir);
        if (file === null) return next();
        res.statusCode = 200;
        res.setHeader("Content-Type", TYPES[extname(file).toLowerCase()] ?? "application/octet-stream");
        res.setHeader("Content-Length", String(statSync(file).size));
        if (req.method === "HEAD") return void res.end();
        createReadStream(file).pipe(res);
      });
    },
    writeBundle() {
      const written = writeGamePublics(outDir, dirs);
      this.info(`wrote ${written} game public files under ${GAME_PUBLIC_FOLDER}/`);
    },
  };
}
