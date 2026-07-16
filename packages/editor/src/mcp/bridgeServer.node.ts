import { createServer } from "node:http";

import type { EditorBridgeResponse, EditorHostApi } from "../session";
import type { EditorBridgeServer, EditorBridgeServerOptions } from "./bridgeServer";
import { decodeEditorBridgeRequest } from "./rpcRequest.ts";

function readBody(request: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    request.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    request.on("end", () => {
      let total = 0;
      for (const chunk of chunks) total += chunk.byteLength;
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }
      resolve(new TextDecoder().decode(merged));
    });
    request.on("error", reject);
  });
}

/** Starts a Node HTTP server exposing the editor host over POST /rpc and GET /health. */
export function startEditorBridgeServerNode(options: EditorBridgeServerOptions): EditorBridgeServer {
  const hostname = options.hostname ?? "127.0.0.1";
  const port = options.port ?? 17373;
  const host: EditorHostApi = options.host;

  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", `http://${hostname}:${port}`);
      if (request.method === "GET" && url.pathname === "/health") {
        const payload = JSON.stringify({ ok: true, gameId: host.gameId });
        response.writeHead(200, { "content-type": "application/json" });
        response.end(payload);
        return;
      }
      if (request.method === "POST" && url.pathname === "/rpc") {
        try {
          const raw = await readBody(request);
          const decoded = decodeEditorBridgeRequest(JSON.parse(raw));
          if (!decoded.ok) {
            const result: EditorBridgeResponse = {
              ok: false,
              error: decoded.errors.map((e) => `${e.path} ${e.message}`).join("; "),
            };
            response.writeHead(400, { "content-type": "application/json" });
            response.end(JSON.stringify(result));
            return;
          }
          const result: EditorBridgeResponse = host.handle(decoded.request);
          response.writeHead(result.ok ? 200 : 400, { "content-type": "application/json" });
          response.end(JSON.stringify(result));
        } catch (error) {
          const result: EditorBridgeResponse = {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          };
          response.writeHead(400, { "content-type": "application/json" });
          response.end(JSON.stringify(result));
        }
        return;
      }
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("jgengine editor bridge\nPOST /rpc  GET /health\n");
    })();
  });

  server.listen(port, hostname);

  return {
    port,
    url: `http://${hostname}:${port}`,
    stop: () => {
      server.close();
    },
  };
}
