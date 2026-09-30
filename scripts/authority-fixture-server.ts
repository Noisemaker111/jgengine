import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, join } from "node:path";
import { createWorldGameServer } from "../packages/node/src/worldServer";
import { fileWorldStore } from "../packages/node/src/fileWorldStore";
import { AUTHORITY_FIXTURE_ID, authorityContent, authorityDefinition } from "../apps/dev/src/demo/hostedAuthority";

import { fixturePorts } from "./authority-fixture-config";

declare const JG_COMPILED_REVISION: string;
const revision = JG_COMPILED_REVISION;
const ports = fixturePorts(process.env);
const root = resolve(process.env["JG_FIXTURE_ARTIFACT"]!);
const data = resolve(process.env["JG_FIXTURE_DATA"]!);
const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
const frontend = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    if (pathname === "/__version") {
      res.setHeader("content-type", "application/json");
      res.setHeader("cache-control", "no-store");
      res.end(JSON.stringify({ revision, component: "frontend", fixture: "hosted-authority", port: ports.frontend }));
      return;
    }
    const path = resolve(root, `.${decodeURIComponent(pathname === "/" ? "/index.html" : pathname)}`);
    if (!path.startsWith(root + "/") && !path.startsWith(root + "\\")) { res.writeHead(403).end(); return; }
    res.setHeader("content-type", pathname === "/__version" ? "application/json" : types[extname(path)] ?? "application/octet-stream");
    res.setHeader("cache-control", "no-store");
    res.end(await readFile(path));
  } catch { res.writeHead(404).end(); }
});
const realm = createServer((req, res) => {
  if (req.url === "/__version") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ revision, component: "realm", fixture: "hosted-authority", port: ports.realm }));
  } else if (req.url === "/__fixture/stop" && req.method === "POST") {
    void stop().then(() => { res.on("finish", () => process.exit(0)); res.end("stopped"); }).catch((error: unknown) => { res.writeHead(500).end(String(error)); });
  } else res.writeHead(404).end();
});
const world = createWorldGameServer({
  resolveGame: (id) => id === AUTHORITY_FIXTURE_ID ? { game: authorityDefinition, content: authorityContent } : null,
  allowAnonymous: true, server: realm, path: "/ws",
  persistence: { store: ({ gameId, serverId }) => fileWorldStore(join(data, `${encodeURIComponent(gameId)}-${encodeURIComponent(serverId)}.json`)) },
});
let stopping: Promise<void> | undefined;
function stop(): Promise<void> {
  return stopping ??= world.close().then(() => {
    frontend.close();
    realm.close();
  });
}
await Promise.all([
  new Promise<void>((resolveReady, reject) => { frontend.once("error", reject); frontend.listen(ports.frontend, "127.0.0.1", resolveReady); }),
  new Promise<void>((resolveReady, reject) => { realm.once("error", reject); realm.listen(ports.realm, "127.0.0.1", resolveReady); }),
]);
world.start();
console.log(JSON.stringify({ ready: true, revision, frontend: ports.frontend, realm: ports.realm }));
process.send?.({ ready: true, revision, frontend: ports.frontend, realm: ports.realm });
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { void stop().then(() => process.exit(0)); });
