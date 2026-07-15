import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

import { EDITOR_SCENE_FILENAME, devSavePlugin } from "./devSavePlugin";

const MODEL_EXT = /\.(glb|gltf)$/i;
const ASSET_ROUTE = "/__jgengine/assets/";
const MANIFEST_ROUTE = "/__jgengine/manifest";

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

function assetIdFromRel(rel: string): string {
  const cleaned = rel
    .replace(MODEL_EXT, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return cleaned.length > 0 ? cleaned : "asset";
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
 * `/__jgengine/assets/*`, and writes Save back to `editor.scene.json` — the server half of
 * `jgengine editor`, drop-in for a Vite dev config.
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
