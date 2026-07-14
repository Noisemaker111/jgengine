import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

import { rewriteTunableExport } from "@jgengine/core/devtools/rewriteTunables";
import type { SaveEndpointRequest, SaveEndpointResponse } from "@jgengine/core/devtools/saveEndpoint";
import { splitTunablePath } from "@jgengine/core/devtools/tunableSchema";
import { importEditorDocumentJson } from "@jgengine/core/editor/document";

/** Route the dev save middleware answers on; matches `installSaveEndpoint` defaults. */
export const SAVE_ENDPOINT_PATH = "/__jgengine/save";

/** Filename editor scene documents are saved under inside a game's `src/`. */
export const EDITOR_SCENE_FILENAME = "editor.scene.json";

const MAX_BODY_BYTES = 8 * 1024 * 1024;

type SrcDirResolver = (gameId: string) => string | null;

function saveEditorDocument(dir: string, json: string): SaveEndpointResponse {
  const document = importEditorDocumentJson(json);
  const path = join(dir, EDITOR_SCENE_FILENAME);
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);
  return { ok: true, path };
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.")) out.push(full);
  }
  return out;
}

function moduleFileForTable(dir: string, table: string): string | null {
  if (table.includes("..")) return null;
  for (const extension of [".ts", ".tsx"]) {
    const candidate = join(dir, `${table}${extension}`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function fileExportingTable(files: readonly string[], table: string): string | null {
  const pattern = new RegExp(`export\\s+(?:const|let)\\s+${table.replace(/[$]/g, "\\$&")}\\b`);
  for (const file of files) {
    if (pattern.test(readFileSync(file, "utf8"))) return file;
  }
  return null;
}

function saveTunables(
  dir: string,
  deltas: readonly { table: string; key: string; value: unknown }[],
): SaveEndpointResponse {
  const files = listSourceFiles(dir);
  const pending = new Map<string, string>();
  const skipped: { table: string; key: string; reason: string }[] = [];
  let applied = 0;

  for (const delta of deltas) {
    const moduleFile = moduleFileForTable(dir, delta.table);
    const file = moduleFile ?? fileExportingTable(files, delta.table);
    if (file === null) {
      skipped.push({ table: delta.table, key: delta.key, reason: "no source file found" });
      continue;
    }
    const exportName = moduleFile !== null ? delta.key : delta.table;
    const path = moduleFile !== null ? [] : splitTunablePath(delta.key);
    const code = pending.get(file) ?? readFileSync(file, "utf8");
    const rewritten = rewriteTunableExport(code, exportName, path, delta.value);
    if (rewritten === null) {
      skipped.push({ table: delta.table, key: delta.key, reason: "could not locate literal" });
      continue;
    }
    pending.set(file, rewritten);
    applied += 1;
  }

  for (const [file, code] of pending) writeFileSync(file, code);
  return { ok: true, applied, skipped };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolvePromise(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Applies one parsed save request against a resolved game `src/` directory. */
export function handleSaveRequest(resolveSrcDir: SrcDirResolver, body: string): SaveEndpointResponse {
  const request = JSON.parse(body) as SaveEndpointRequest;
  const dir = resolveSrcDir(request.gameId);
  if (dir === null) return { ok: false, error: `unknown game: ${request.gameId}` };
  if (request.kind === "editor-document") return saveEditorDocument(dir, request.json);
  if (request.kind === "tunables") return saveTunables(dir, request.deltas);
  return { ok: false, error: "unknown save kind" };
}

interface DevSavePluginShape {
  name: string;
  apply: "serve";
  configureServer(server: {
    middlewares: {
      use(
        route: string,
        handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void,
      ): void;
    };
  }): void;
}

/**
 * Dev-only Vite middleware that gives the F2 chord family its write path:
 * editor mode's Save (Ctrl+S / `save_scene`) writes `editor.scene.json` and
 * debug mode's Tune "Save to source" rewrites tunable literals, both into the
 * directory `resolveSrcDir(gameId)` returns.
 */
export function devSavePlugin(resolveSrcDir: SrcDirResolver): DevSavePluginShape {
  return {
    name: "jgengine-dev-save",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(SAVE_ENDPOINT_PATH, (req, res, next) => {
        if (req.method !== "POST") {
          next();
          return;
        }
        void readBody(req)
          .then((body) => {
            const response = handleSaveRequest(resolveSrcDir, body);
            res.statusCode = response.ok ? 200 : 400;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(response));
          })
          .catch((error: unknown) => {
            res.statusCode = 400;
            res.setHeader("content-type", "application/json");
            res.end(
              JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }),
            );
          });
      });
    },
  };
}

/**
 * `devSavePlugin` preset for a standalone game project (one game, `src/` at
 * the project root): every gameId maps to `<rootDir>/src`. Drop into the
 * scaffolded `vite.config.ts` plugins array.
 */
export function standaloneSavePlugin(rootDir: string = process.cwd()): DevSavePluginShape {
  const srcDir = resolve(rootDir, "src");
  return devSavePlugin(() => (existsSync(srcDir) ? srcDir : null));
}
