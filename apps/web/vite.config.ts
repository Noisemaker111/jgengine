import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, type Connect, type Plugin } from "vite";

import { restoreFromCache, saveToCache } from "../../scripts/games-player-cache";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const devAppRoot = fileURLToPath(new URL("../dev", import.meta.url));
const gamesDir = fileURLToPath(new URL("../../Games", import.meta.url));
const githubSrc = fileURLToPath(new URL("../../packages/github/src", import.meta.url));

const GAMES_INDEX_ID = "virtual:jgengine-games";

/** Exposes the Games/* ids to routes as `virtual:jgengine-games`, resolved at build time. */
const gamesIndexPlugin = (): Plugin => ({
  name: "jgengine-games-index",
  resolveId(id) {
    if (id === GAMES_INDEX_ID) return `\0${GAMES_INDEX_ID}`;
  },
  load(id) {
    if (id !== `\0${GAMES_INDEX_ID}`) return;
    const ids = readdirSync(gamesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(gamesDir, entry.name, "src/index.tsx")))
      .map((entry) => entry.name)
      .sort();
    return `export const GAME_IDS = ${JSON.stringify(ids)};`;
  },
});

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
      console.log("[games-player] cache hit — Games/* unchanged, skipped rebuild");
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

const isPlayerPath = (url: string | undefined): url is string =>
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
 * proxy. A content-hash cache makes the build a restore when Games/* and the
 * engine packages are unchanged; otherwise it rebuilds in the background and
 * /play shows a self-refreshing "building" page until the output lands.
 */
const gamesPlayerDevPlugin = (): Plugin => {
  let ready = false;
  let failed = false;
  return {
    name: "games-player-dev",
    apply: "serve",
    configureServer(server) {
      if (restoreFromCache()) {
        ready = true;
        console.log("[games-player] cache hit — serving /play from the cached build");
      } else {
        console.log("[games-player] building the /play runner in the background…");
        const build: ChildProcess = spawn("bun", ["run", "--cwd", devAppRoot, "build:site"], {
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
        const stopBuild = () => build.kill();
        server.httpServer?.once("close", stopBuild);
        process.once("exit", stopBuild);
      }
      server.middlewares.stack.unshift({
        route: "",
        handle: ((req, res, next) => {
          if (!isPlayerPath(req.url)) return next();
          if (!ready) {
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

export default defineConfig({
  server: { port: 3000, fs: { allow: [repoRoot] } },
  resolve: {
    alias: [
      { find: /^@jgengine\/github$/, replacement: `${githubSrc}/index.ts` },
      { find: /^@jgengine\/github\/(.*)$/, replacement: `${githubSrc}/$1` },
    ],
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: true,
        crawlLinks: true,
        filter: (page: { path: string }) => {
          const path = page.path.replace(/[?#].*$/, "");
          return !path.endsWith(".md") && !path.startsWith("/play");
        },
      },
    } as Parameters<typeof tanstackStart>[0]),
    nitro({ devServer: { runner: "self" } }),
    viteReact(),
    registryPlugin(),
    gamesIndexPlugin(),
    gamesPlayerPlugin(),
    gamesPlayerDevPlugin(),
  ],
});
