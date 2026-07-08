import type { IncomingMessage, ServerResponse } from "node:http";

export type WebHandler = (request: Request) => Promise<Response>;

export type NodeHandler = (req: IncomingMessage, res: ServerResponse) => void;

export function toWebRequest(req: IncomingMessage): Request {
  const host = req.headers.host ?? "localhost";
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) for (const entry of value) headers.append(key, entry);
  }
  return new Request(`http://${host}${req.url ?? "/"}`, { method: req.method, headers });
}

export function toNodeHandler(handler: WebHandler): NodeHandler {
  return (req, res) => {
    void handler(toWebRequest(req))
      .then(async (response) => {
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(Buffer.from(await response.arrayBuffer()));
      })
      .catch((error: unknown) => {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : "internal error" }));
      });
  };
}
