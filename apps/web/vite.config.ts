import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig, type Connect, type Plugin } from "vite";

import { restoreFromCache, saveToCache } from "../../scripts/games-player-cache";
import { devServerMarkerPlugin } from "../../scripts/devServerMarker";
import { devReportPlugin } from "../dev/devReportPlugin";
import { gamesIndexPlugin, siteAliases } from "./vite.site";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const devAppRoot = fileURLToPath(new URL("../dev", import.meta.url));
const registryScript = fileURLToPath(
  new URL("../../scripts/build-registry.ts", import.meta.url),
);

let registryBuilt = false;

const registryPlugin = (): Plugin => ({
  name: "jgengine-registry",
  buildStart() {
    if (registryBuilt) return;
    registryBuilt = true;
    const result = spawnSync("bun", [registryScript], { stdio: "inherit" });
    if (result.status !== 0) {
      throw new Error("jgengine-registry: scripts/build-registry.ts failed");
    }
  },
});

let gamePlayerBuilt = false;

const gamesPlayerPlugin = (): Plugin => ({
  name: "games-player",
  apply: "build",
  buildStart() {
    if (gamePlayerBuilt) return;
    gamePlayerBuilt = true;
    if (restoreFromCache()) {
      console.log("[games-player] cache hit — games/* unchanged, skipped rebuild");
      return;
    }
    const result = spawnSync("bun", ["run", "--cwd", devAppRoot, "build:site"], {
      stdio: "inherit",
    });
    if (result.status !== 0) {
      throw new Error("games-player: apps/dev build:site failed");
    }
    saveToCache();
  },
});

/**
 * Makes wrangler run the site's asset check before every upload. A built site deploys through the
 * generated `dist/server/wrangler.json` (reached from `.wrangler/deploy/config.json`), which ignores
 * `build` in `wrangler.jsonc`, so the command goes into the generated file. A bare `wrangler deploy`
 * therefore refuses a build whose models, LUTs or HDRIs are missing, as `bun run deploy:site` does.
 * (2026-11-10: a bare deploy put jgengine.com live with every game model returning 404; issue #3114.)
 */
const checkAssetsBeforeUploadPlugin = (): Plugin => ({
  name: "jgengine-check-assets-before-upload",
  apply: "build",
  enforce: "post",
  generateBundle(_, bundle) {
    const emitted = bundle["wrangler.json"];
    if (emitted === undefined || emitted.type !== "asset" || typeof emitted.source !== "string") return;
    const config = JSON.parse(emitted.source) as Record<string, unknown>;
    config["build"] = { command: "bun scripts/check-site-assets.ts --before-upload", cwd: repoRoot };
    emitted.source = JSON.stringify(config);
  },
});

const isPlayerPath =(url: string | undefined): url is string =>
  url !== undefined && (url === "/play" || url.startsWith("/play/") || url.startsWith("/play?"));

const playerStatusPage = (title: string, body: string, refresh: boolean) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    ${refresh ? '<meta http-equiv="refresh" content="3" />' : ""}
    <title>${title}</title>
    <style>body{display:grid;place-items:center;min-height:100dvh;margin:0;background:#0a0a0a;color:#d4d4d4;font:14px/1.6 ui-monospace,monospace;text-align:center}</style>
  </head>
  <body><div><h1 style="font-size:1rem;color:#34d399">${title}</h1><p>${body}</p></div></body>
</html>`;

/**
 * Dev serves the same static runner build production ships — one server, no
 * proxy. A content-hash cache makes the build a restore when games/* and the
 * engine packages are unchanged; otherwise it rebuilds in the background and
 * /play shows a self-refreshing "building" page until the output lands.
 */
const gamesPlayerDevPlugin = (): Plugin => {
  let ready = false;
  let failed = false;
  let build: ChildProcess | null = null;
  return {
    name: "games-player-dev",
    apply: "serve",
    configureServer(server) {
      const startBuild = () => {
        if (build !== null || ready || failed) return;
        console.log("[games-player] building the /play runner in the background…");
        build = spawn("bun", ["run", "--cwd", devAppRoot, "build:site"], {
          stdio: "inherit",
        });
        build.once("exit", (code) => {
          if (code === 0) {
            saveToCache();
            ready = true;
            console.log("[games-player] /play runner ready");
          } else {
            failed = true;
          }
        });
      };
      if (restoreFromCache()) {
        ready = true;
        console.log("[games-player] cache hit — serving /play from the cached build");
      } else if (process.env["JG_CAPTURE_SITE"] !== "1") {
        startBuild();
      } else {
        console.log("[games-player] deferred /play runner build for website capture");
      }
      const stopBuild = () => build?.kill();
      server.httpServer?.once("close", stopBuild);
      process.once("exit", stopBuild);
      server.middlewares.stack.unshift({
        route: "",
        handle: ((req, res, next) => {
          if (!isPlayerPath(req.url)) return next();
          if (!ready) {
            startBuild();
            res.statusCode = failed ? 500 : 503;
            res.setHeader("content-type", "text/html");
            res.end(
              failed
                ? playerStatusPage(
                    "games player build failed",
                    "check the terminal output from <code>apps/dev build:site</code> and restart the dev server",
                    false,
                  )
                : playerStatusPage("games player is building…", "this page reloads until it is ready", true),
            );
            return;
          }
          const query = req.url.indexOf("?");
          const path = query === -1 ? req.url : req.url.slice(0, query);
          if (path === "/play" || path === "/play/") {
            req.url = `/play/index.html${query === -1 ? "" : req.url.slice(query)}`;
          }
          next();
        }) as Connect.NextHandleFunction,
      });
    },
  };
};

/** True for a request the site's page renderer answers: a GET for a path with no file extension. */
export const isPageRequest = (method: string | undefined, url: string | undefined): boolean => {
  if (method !== "GET" && method !== "HEAD") return false;
  const pathname = url?.split(/[?#]/, 1)[0];
  if (pathname === undefined || pathname === "/play" || pathname.startsWith("/play/")) return false;
  if (/^\/(?:api|src|node_modules|@[a-z-]+|__[a-z-]+)(?:\/|$)/.test(pathname)) return false;
  return !/\.[A-Za-z0-9]+$/.test(pathname.slice(pathname.lastIndexOf("/") + 1));
};

/**
 * Dev: draw each page on request with the engine's JSX renderer (the same `renderPage` the build
 * prerenders with), so a page in dev is the HTML production serves plus Vite's client. The sitemap
 * comes from the same page list the build writes `sitemap.xml` from.
 */
const sitePagesDevPlugin = (): Plugin => ({
  name: "jgengine-site-pages",
  apply: "serve",
  configureServer(server) {
    server.middlewares.stack.unshift({
      route: "",
      handle: (async (req, res, next) => {
        const sitemap = (req.method === "GET" || req.method === "HEAD") && req.url?.split(/[?#]/, 1)[0] === "/sitemap.xml";
        if (!sitemap && !isPageRequest(req.method, req.url)) return next();
        try {
          const url = req.url ?? "/";
          const { renderPage, renderSitemap } = (await server.ssrLoadModule("/src/site/render.tsx")) as typeof import("./src/site/render");
          if (sitemap) {
            res.setHeader("content-type", "application/xml; charset=utf-8");
            res.end(renderSitemap());
            return;
          }
          const page = await renderPage(url.split(/[?#]/, 1)[0] ?? "/", () => ({
            stylesheets: ["/src/styles.css"],
            fonts: [],
            modulePreloads: [],
            scripts: ["/src/client.tsx"],
          }));
          const html = await server.transformIndexHtml(url, page.html);
          res.statusCode = page.status;
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.end(html);
        } catch (error) {
          server.ssrFixStacktrace(error as Error);
          next(error);
        }
      }) as Connect.NextHandleFunction,
    });
  },
});

export default defineConfig({
  server: { port: 3000, fs: { allow: [repoRoot] } },
  resolve: { alias: siteAliases },
  environments: {
    // The browser entry and the stylesheet; `scripts/prerender.ts` reads the manifest to link each page's files.
    client: {
      build: {
        manifest: true,
        rolldownOptions: { input: { client: "src/client.tsx", styles: "src/styles.css" } },
      },
    },
    // The Worker (src/worker.ts): API proxy, agent text files, not-found fallback.
    worker: { build: { outDir: "dist/server" } },
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: "worker" } }),
    checkAssetsBeforeUploadPlugin(),
    tailwindcss(),
    // Dev only: publish this server (so `bun run perf live <game>` finds it) and accept the
    // in-page perf report a game pushes from the /play runner it serves.
    devServerMarkerPlugin({ kind: "website" }),
    devReportPlugin(),
    sitePagesDevPlugin(),
    registryPlugin(),
    gamesIndexPlugin(),
    gamesPlayerPlugin(),
    gamesPlayerDevPlugin(),
  ],
});
