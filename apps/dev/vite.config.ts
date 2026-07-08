import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type ProxyOptions } from "vite";

import { parseDevProxyTable } from "../../packages/core/src/data/devProxy";

const src = (pkg: string) => fileURLToPath(new URL(`../../packages/${pkg}/src`, import.meta.url));
const game = (name: string) => fileURLToPath(new URL(`../../Games/${name}/src`, import.meta.url));
const gamesDir = fileURLToPath(new URL("../../Games", import.meta.url));

const gameAliases = readdirSync(gamesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(gamesDir, entry.name, "src/index.tsx")))
  .flatMap((entry) => [
    { find: new RegExp(`^@games/${entry.name}$`), replacement: `${game(entry.name)}/index.tsx` },
    { find: new RegExp(`^@games/${entry.name}/(.*)$`), replacement: `${game(entry.name)}/$1` },
  ]);

const devProxyTable = parseDevProxyTable(process.env.VITE_JGENGINE_DEV_PROXY);
const devProxy: Record<string, string | ProxyOptions> = Object.fromEntries(
  Object.entries(devProxyTable).map(([routeName, target]) => [
    `/proxy/${routeName}`,
    {
      target,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(new RegExp(`^/proxy/${routeName}`), ""),
    },
  ]),
);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  build: { target: "es2022" },
  server: {
    host: true,
    proxy: devProxy,
    hmr:
      process.env.JG_PLAY_HMR_PORT === undefined
        ? undefined
        : { host: "localhost", clientPort: Number(process.env.JG_PLAY_HMR_PORT) },
  },
  resolve: {
    extensions: [".ts", ".tsx", ".mjs", ".js", ".jsx", ".json"],
    alias: [
      { find: /^@jgengine\/core\/(.*)$/, replacement: `${src("core")}/$1` },
      { find: /^@jgengine\/react\/(.*)$/, replacement: `${src("react")}/$1` },
      { find: /^@jgengine\/ws\/(.*)$/, replacement: `${src("ws")}/$1` },
      { find: /^@jgengine\/convex\/(.*)$/, replacement: `${src("convex")}/$1` },
      { find: /^@jgengine\/shell\/(.*)$/, replacement: `${src("shell")}/$1` },
      { find: /^@jgengine\/github$/, replacement: `${src("github")}/index.ts` },
      { find: /^@jgengine\/github\/(.*)$/, replacement: `${src("github")}/$1` },
      { find: /^@jgengine\/assets$/, replacement: `${src("assets")}/index.ts` },
      { find: /^@jgengine\/assets\/(.*)$/, replacement: `${src("assets")}/$1` },
      ...gameAliases,
    ],
  },
});
