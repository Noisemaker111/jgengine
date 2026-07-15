import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { request } from "node:http";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, type Connect, type Plugin } from "vite";

import { restoreFromCache, saveToCache } from "../../scripts/games-player-cache";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const devAppRoot = fileURLToPath(new URL("../dev", import.meta.url));
const githubSrc = fileURLToPath(new URL("../../packages/github/src", import.meta.url));

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

const PLAYER_DEV_PORT = 5199;

const isPlayerPath = (url: string | undefined): url is string =>
  url !== undefined && (url === "/play" || url.startsWith("/play/") || url.startsWith("/play?"));

const gamesPlayerDevPlugin = (): Plugin => {
  let player: ChildProcess | undefined;
  return {
    name: "games-player-dev",
    apply: "serve",
    configureServer(server) {
      if (player === undefined) {
        player = spawn("bun", ["run", "--cwd", devAppRoot, "dev:site"], { stdio: "inherit" });
        const stopPlayer = () => player?.kill();
        server.httpServer?.once("close", stopPlayer);
        process.once("exit", stopPlayer);
      }
      server.middlewares.stack.unshift({
        route: "",
        handle: ((req, res, next) => {
          if (!isPlayerPath(req.url)) return next();
          const upstream = request(
            { host: "127.0.0.1", port: PLAYER_DEV_PORT, path: req.url, method: req.method, headers: req.headers },
            (upstreamRes) => {
              res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
              upstreamRes.pipe(res);
            },
          );
          upstream.on("error", () => {
            res.statusCode = 502;
            res.end("games player is still starting — reload in a second");
          });
          req.pipe(upstream);
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
    gamesPlayerPlugin(),
    gamesPlayerDevPlugin(),
  ],
});
