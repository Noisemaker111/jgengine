import type { IncomingMessage, ServerResponse } from "node:http";

export type WebHandler = (request: Request) => Promise<Response>;

export type NodeHandler = (req: IncomingMessage, res: ServerResponse) => void;

export async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host ?? "localhost";
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) for (const entry of value) headers.append(key, entry);
  }
  const method = req.method ?? "GET";
  let body: Uint8Array | undefined;
  if (method !== "GET" && method !== "HEAD") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    if (chunks.length > 0) {
      const buffer = Buffer.concat(chunks);
      if (buffer.byteLength > 0) body = new Uint8Array(buffer);
    }
  }
  return new Request(`http://${host}${req.url ?? "/"}`, { method, headers, body });
}

export function toNodeHandler(handler: WebHandler): NodeHandler {
  return (req, res) => {
    void toWebRequest(req)
      .then(handler)
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
