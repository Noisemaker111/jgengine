import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";

import type { Plugin } from "vite";

import { assetStoreRoot } from "../../packages/assets/src/assetStore";
import { compressedVariant, textureVariantDir } from "../../games/shared/textureVariants";

const TYPES: Readonly<Record<string, string>> = {
  ".gltf": "model/gltf+json",
  ".glb": "model/gltf-binary",
  ".bin": "application/octet-stream",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ktx2": "image/ktx2",
  ".json": "application/json",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".hdr": "application/octet-stream",
};

/**
 * The `public/` folders a runner serves after its own: the `--game-dir` game first, then every
 * game under `games/`. A game's provisioned models (`public/models/library/...`) and pulled packs
 * live in its own folder, not in `apps/dev/public`, so without this a game drawn by `bun run drive`
 * shows placeholder boxes where its standalone dev server shows the real models.
 */
export function gamePublicRoots(servedGameDir: string | undefined, gamesDir: string): string[] {
  const roots: string[] = [];
  if (servedGameDir !== undefined && servedGameDir !== "") roots.push(join(servedGameDir, "public"));
  if (existsSync(gamesDir)) {
    for (const entry of readdirSync(gamesDir, { withFileTypes: true })) {
      if (entry.isDirectory() || entry.isSymbolicLink()) roots.push(join(gamesDir, entry.name, "public"));
    }
  }
  return roots.filter((root) => existsSync(root));
}

/**
 * The file a request path names under the first root that holds it, never escaping a root. With a
 * `variantDir` (the asset store's KTX2 cache, `games/shared/textureVariants.ts`), a model or image
 * that has a GPU-compressed twin there is answered with the twin.
 */
export function resolveGamePublicFile(url: string, roots: readonly string[], variantDir?: string): string | null {
  const [target = ""] = url.split("#", 1);
  const query = target.indexOf("?");
  const search = query < 0 ? "" : target.slice(query + 1);
  const path = decodeURIComponent(query < 0 ? target : target.slice(0, query));
  if (!path.startsWith("/") || path.includes("\0")) return null;
  const relative = normalize(path.slice(1));
  if (relative.startsWith("..") || relative === ".") return null;
  for (const root of roots) {
    const base = resolve(root);
    const file = resolve(base, relative);
    if (file !== base && !file.startsWith(base + sep)) continue;
    if (existsSync(file) && statSync(file).isFile()) return (variantDir === undefined ? null : compressedVariant(file, search, variantDir)) ?? file;
  }
  return null;
}

/** Serve game `public/` files the runner's own `public/` (`runnerPublic`, served first) doesn't have. */
export function gamePublicPlugin(servedGameDir: string | undefined, gamesDir: string, runnerPublic: string): Plugin {
  const games = gamePublicRoots(servedGameDir, gamesDir);
  const roots = games.length === 0 ? [] : [runnerPublic, ...games];
  const variantDir = textureVariantDir(assetStoreRoot(dirname(resolve(gamesDir))));
  return {
    name: "jgengine-game-public",
    configureServer(server) {
      if (roots.length === 0) return;
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        const file = resolveGamePublicFile(req.url ?? "", roots, variantDir);
        if (file === null) return next();
        res.statusCode = 200;
        res.setHeader("Content-Type", TYPES[extname(file).toLowerCase()] ?? "application/octet-stream");
        res.setHeader("Content-Length", String(statSync(file).size));
        if (req.method === "HEAD") return void res.end();
        createReadStream(file).pipe(res);
      });
    },
  };
}
