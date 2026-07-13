import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

import { importEditorDocumentJson } from "../../packages/core/src/editor/document";
import { rewriteTunableExport } from "../../packages/core/src/devtools/rewriteTunables";
import { splitTunablePath } from "../../packages/core/src/devtools/tunableSchema";
import type {
  SaveEndpointRequest,
  SaveEndpointResponse,
} from "../../packages/core/src/devtools/saveEndpoint";

export const SAVE_ENDPOINT_PATH = "/__jgengine/save";
export const EDITOR_SCENE_FILENAME = "editor.scene.json";

const GAME_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const MAX_BODY_BYTES = 8 * 1024 * 1024;

function gameSrcDir(gamesDir: string, gameId: string): string | null {
  if (!GAME_ID_PATTERN.test(gameId)) return null;
  const dir = join(gamesDir, gameId, "src");
  return existsSync(dir) ? dir : null;
}

function saveEditorDocument(gamesDir: string, gameId: string, json: string): SaveEndpointResponse {
  const dir = gameSrcDir(gamesDir, gameId);
  if (dir === null) return { ok: false, error: `unknown game: ${gameId}` };
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
  gamesDir: string,
  gameId: string,
  deltas: readonly { table: string; key: string; value: unknown }[],
): SaveEndpointResponse {
  const dir = gameSrcDir(gamesDir, gameId);
  if (dir === null) return { ok: false, error: `unknown game: ${gameId}` };
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
  return new Promise((resolve, reject) => {
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
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function handleSaveRequest(gamesDir: string, body: string): SaveEndpointResponse {
  const request = JSON.parse(body) as SaveEndpointRequest;
  if (request.kind === "editor-document") {
    return saveEditorDocument(gamesDir, request.gameId, request.json);
  }
  if (request.kind === "tunables") {
    return saveTunables(gamesDir, request.gameId, request.deltas);
  }
  return { ok: false, error: "unknown save kind" };
}

/** Dev-only Vite middleware: writes editor scene documents and tunable deltas into Games/<id>/src. */
export function devSavePlugin(gamesDir: string): {
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
} {
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
            const result = handleSaveRequest(gamesDir, body);
            res.statusCode = result.ok ? 200 : 400;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(result));
          })
          .catch((error: unknown) => {
            res.statusCode = 400;
            res.setHeader("content-type", "application/json");
            res.end(
              JSON.stringify({
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            );
          });
      });
    },
  };
}
