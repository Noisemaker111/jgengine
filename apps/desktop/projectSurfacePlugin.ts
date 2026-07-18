import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";

import type { Connect, Plugin } from "vite";

import type { GameMount } from "./src/project/commands";
import type { GameSettingsPatch } from "./src/project/gameMeta";
import { createProjectSurfaceHost, type ProjectSurfaceHost } from "./project/processManager";

export const PROJECT_SURFACE_PREFIX = "/__jgengine/project";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.byteLength;
      if (total > 1_000_000) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(payload);
}

function parseMount(value: unknown): GameMount | null {
  if (value === "runner" || value === "standalone" || value === "website") return value;
  return null;
}

async function handleProjectRequest(
  host: ProjectSurfaceHost,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (!url.pathname.startsWith(PROJECT_SURFACE_PREFIX)) return false;
  const path = url.pathname.slice(PROJECT_SURFACE_PREFIX.length) || "/";
  const method = (req.method ?? "GET").toUpperCase();

  try {
    if (method === "GET" && path === "/games") {
      sendJson(res, 200, { games: host.list() });
      return true;
    }

    if (method === "GET" && path === "/status") {
      sendJson(res, 200, { processes: host.status() });
      return true;
    }

    const thumbMatch = path.match(/^\/games\/([a-z0-9][a-z0-9-]*)\/thumbnail$/);
    if (method === "GET" && thumbMatch?.[1] !== undefined) {
      const thumb = host.readThumbnail(thumbMatch[1]);
      if (thumb === null) {
        sendJson(res, 404, { ok: false, error: "no thumbnail" });
        return true;
      }
      res.writeHead(200, {
        "content-type": thumb.contentType,
        "cache-control": "no-cache",
      });
      res.end(thumb.data);
      return true;
    }

    const gameMatch = path.match(/^\/games\/([a-z0-9][a-z0-9-]*)$/);
    if (method === "GET" && gameMatch?.[1] !== undefined) {
      const game = host.get(gameMatch[1]);
      if (game === null) {
        sendJson(res, 404, { ok: false, error: "unknown game" });
        return true;
      }
      sendJson(res, 200, { game });
      return true;
    }

    if (method === "POST" && path === "/new-game") {
      const body = JSON.parse(await readBody(req)) as { id?: string; name?: string };
      if (typeof body.id !== "string") {
        sendJson(res, 400, { ok: false, error: "id required" });
        return true;
      }
      const result = host.newGame(body.id, typeof body.name === "string" ? body.name : undefined);
      sendJson(res, result.ok ? 200 : 400, result);
      return true;
    }

    if (method === "POST" && path === "/gate") {
      const result = host.runGate();
      sendJson(res, result.ok ? 200 : 400, result);
      return true;
    }

    const settingsMatch = path.match(/^\/games\/([a-z0-9][a-z0-9-]*)\/settings$/);
    if (method === "POST" && settingsMatch?.[1] !== undefined) {
      const body = JSON.parse(await readBody(req)) as GameSettingsPatch;
      const result = host.saveSettings(settingsMatch[1], body);
      sendJson(res, result.ok ? 200 : 400, result);
      return true;
    }

    const startMatch = path.match(/^\/games\/([a-z0-9][a-z0-9-]*)\/start$/);
    if (method === "POST" && startMatch?.[1] !== undefined) {
      const body = JSON.parse((await readBody(req)) || "{}") as { mount?: unknown };
      const mount = parseMount(body.mount) ?? "standalone";
      const result = host.startGame(startMatch[1], mount);
      sendJson(res, result.ok ? 200 : 400, result);
      return true;
    }

    const stopMatch = path.match(/^\/processes\/(.+)\/stop$/);
    if (method === "POST" && stopMatch?.[1] !== undefined) {
      const key = decodeURIComponent(stopMatch[1]);
      const result = host.stop(key);
      sendJson(res, result.ok ? 200 : 400, result);
      return true;
    }

    const streamMatch = path.match(/^\/processes\/(.+)\/stream$/);
    if (method === "GET" && streamMatch?.[1] !== undefined) {
      const key = decodeURIComponent(streamMatch[1]);
      const snap = host.getProcess(key);
      if (snap === null) {
        sendJson(res, 404, { ok: false, error: "unknown process" });
        return true;
      }
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      });
      for (const line of snap.lines) {
        res.write(`data: ${JSON.stringify({ line })}\n\n`);
      }
      if (!snap.running) {
        res.write(`data: ${JSON.stringify({ done: true, exitCode: snap.exitCode })}\n\n`);
        res.end();
        return true;
      }
      const unsubscribe = host.subscribe(key, (line) => {
        res.write(`data: ${JSON.stringify({ line })}\n\n`);
        if (line.startsWith("[exit] ")) {
          const code = Number(line.slice("[exit] ".length));
          res.write(
            `data: ${JSON.stringify({ done: true, exitCode: Number.isFinite(code) ? code : null })}\n\n`,
          );
          res.end();
          unsubscribe();
        }
      });
      req.on("close", () => {
        unsubscribe();
      });
      return true;
    }

    sendJson(res, 404, { ok: false, error: "unknown project surface route" });
    return true;
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}

export function projectSurfacePlugin(options?: {
  repoRoot?: string;
  gamesDir?: string;
}): Plugin {
  const repoRoot =
    options?.repoRoot ?? fileURLToPath(new URL("../..", import.meta.url));
  const gamesDir = options?.gamesDir ?? fileURLToPath(new URL("../../Games", import.meta.url));
  const host = createProjectSurfaceHost({ repoRoot, gamesDir });

  return {
    name: "jgengine-project-surface",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (!url.pathname.startsWith(PROJECT_SURFACE_PREFIX)) {
          next();
          return;
        }
        void handleProjectRequest(host, req, res, url).then((handled) => {
          if (!handled) next();
        });
      }) as Connect.NextHandleFunction);
    },
  };
}
