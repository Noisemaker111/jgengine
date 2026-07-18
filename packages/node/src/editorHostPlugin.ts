import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

import { MODEL_EXT, assetIdFromRel, safeAssetFilename } from "./assetNaming";
import { EDITOR_SCENE_FILENAME, devSavePlugin } from "./devSavePlugin";
import { importPromotedAsset, isPromotedProject } from "./promotedAssetCatalog";

const ASSET_ROUTE = "/__jgengine/assets/";
const MANIFEST_ROUTE = "/__jgengine/manifest";
const IMPORT_ROUTE = "/__jgengine/import-asset";
const MAX_ASSET_BYTES = 128 * 1024 * 1024;

/** One placeable model the standalone editor lists — a stable id and a URL the dev server serves it from. */
export interface EditorManifestAsset {
  id: string;
  url: string;
  label: string;
}

/** What the standalone editor loads on boot: the on-disk scene document (if any) and every model in the asset folder. */
export interface EditorManifest {
  scene: unknown | null;
  assets: EditorManifestAsset[];
}

function walkModels(root: string, dir: string = root): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkModels(root, full));
    else if (MODEL_EXT.test(entry.name)) out.push(relative(root, full));
  }
  return out.sort();
}

/**
 * Reads the scene document and scans the asset folder — the pure core the dev server serves at `/__jgengine/manifest`.
 * @internal
 */
export function buildEditorManifest(sceneDir: string, assetsDir: string): EditorManifest {
  const scenePath = join(sceneDir, EDITOR_SCENE_FILENAME);
  let scene: unknown | null = null;
  if (existsSync(scenePath)) {
    try {
      scene = JSON.parse(readFileSync(scenePath, "utf8"));
    } catch {
      scene = null;
    }
  }
  const assets = walkModels(assetsDir).map((rel) => {
    const web = rel.split(sep).join("/");
    return { id: assetIdFromRel(web), url: ASSET_ROUTE + web, label: web };
  });
  return { scene, assets };
}

/**
 * Persists an uploaded model into the asset folder so it survives reload and the manifest scan re-lists it
 * under the same id — the durable counterpart to the standalone editor's ephemeral blob imports. Returns the
 * manifest entry (id/url/label) the scan would produce for the written file. The pure core `/__jgengine/import-asset` serves.
 * @internal
 */
export function importEditorAsset(
  assetsDir: string,
  filename: string,
  bytes: Uint8Array,
): EditorManifestAsset {
  if (!MODEL_EXT.test(filename)) {
    throw new Error(`unsupported asset file (expected .glb/.gltf): ${filename}`);
  }
  const safe = safeAssetFilename(filename);
  mkdirSync(assetsDir, { recursive: true });
  writeFileSync(join(assetsDir, safe), bytes);
  return { id: assetIdFromRel(safe), url: ASSET_ROUTE + safe, label: safe };
}

function readBodyBuffer(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolvePromise, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_ASSET_BYTES) {
        reject(new Error("asset upload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolvePromise(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

interface DevServerLike {
  middlewares: {
    use(
      route: string,
      handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void,
    ): void;
  };
}

interface EditorHostPluginShape {
  name: string;
  apply: "serve";
  configureServer(server: DevServerLike): void;
}

/** Where the standalone editor reads and writes: the scene folder and the model folder it scans. */
export interface EditorHostOptions {
  /** Directory the scene document lives in and Save writes back to. Default `process.cwd()`. */
  dir?: string;
  /** Directory scanned for placeable `.glb`/`.gltf` models. Default `<dir>/assets` if present, else `<dir>`. */
  assetsDir?: string;
}

/**
 * Dev-server plugin that turns any folder into a standalone-editor workspace: it serves the folder's
 * `editor.scene.json` and every model under it at `/__jgengine/manifest`, streams the model bytes at
 * `/__jgengine/assets/*`, persists uploaded models into the asset folder at `POST /__jgengine/import-asset`
 * (so a dropped GLB survives reload as a durable catalog asset), and writes Save back to `editor.scene.json`
 * — the server half of `jgengine editor`, drop-in for a Vite dev config.
 * @internal
 */
export function editorHostPlugin(options: EditorHostOptions = {}): EditorHostPluginShape {
  const dir = resolve(options.dir ?? process.cwd());
  const assetsDir = resolve(
    options.assetsDir ?? (existsSync(join(dir, "assets")) ? join(dir, "assets") : dir),
  );
  const save = devSavePlugin(() => dir);
  return {
    name: "jgengine-editor-host",
    apply: "serve",
    configureServer(server) {
      save.configureServer(server);
      server.middlewares.use(MANIFEST_ROUTE, (req, res, next) => {
        if (req.method !== "GET") {
          next();
          return;
        }
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(buildEditorManifest(dir, assetsDir)));
      });
      server.middlewares.use(IMPORT_ROUTE, (req, res, next) => {
        if (req.method !== "POST") {
          next();
          return;
        }
        const header = req.headers["x-jg-filename"];
        const rawName = Array.isArray(header) ? header[0] : header;
        void readBodyBuffer(req)
          .then((bytes) => {
            let filename: string;
            try {
              filename = decodeURIComponent(rawName ?? "");
            } catch {
              filename = rawName ?? "";
            }
            let asset: EditorManifestAsset;
            if (isPromotedProject(dir)) {
              // Promoted projects resolve assets through a typed `src/game/assets.ts` catalog, so
              // persist a durable `extras` entry there. A thrown transform error (unparseable or
              // multi-call source) falls back to the folder-scan import, preserving the contract.
              try {
                asset = importPromotedAsset(dir, filename, bytes);
              } catch {
                asset = importEditorAsset(assetsDir, filename, bytes);
              }
            } else {
              asset = importEditorAsset(assetsDir, filename, bytes);
            }
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(asset));
          })
          .catch((error: unknown) => {
            res.statusCode = 400;
            res.setHeader("content-type", "application/json");
            res.end(
              JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
            );
          });
      });
      server.middlewares.use(ASSET_ROUTE, (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? "").split("?")[0]).replace(/^\/+/, "");
        const full = resolve(assetsDir, rel);
        if (!full.startsWith(assetsDir) || !existsSync(full) || !statSync(full).isFile()) {
          next();
          return;
        }
        res.setHeader(
          "content-type",
          extname(full).toLowerCase() === ".glb" ? "model/gltf-binary" : "model/gltf+json",
        );
        res.end(readFileSync(full));
      });
    },
  };
}
