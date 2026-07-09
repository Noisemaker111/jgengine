import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const src = (pkg: string) => fileURLToPath(new URL(`../../packages/${pkg}/src`, import.meta.url));
const game = (name: string) => fileURLToPath(new URL(`../../Games/${name}/src`, import.meta.url));
const gamesDir = fileURLToPath(new URL("../../Games", import.meta.url));
const registryUi = fileURLToPath(new URL("../../registry/jgengine", import.meta.url));

const gameAliases = readdirSync(gamesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(gamesDir, entry.name, "src/index.tsx")))
  .flatMap((entry) => [
    { find: new RegExp(`^@games/${entry.name}$`), replacement: `${game(entry.name)}/index.tsx` },
    { find: new RegExp(`^@games/${entry.name}/(.*)$`), replacement: `${game(entry.name)}/$1` },
  ]);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: "es2022" },
  resolve: {
    extensions: [".ts", ".tsx", ".mjs", ".js", ".jsx", ".json"],
    alias: [
      { find: /^@\/components\/ui\/(.*)$/, replacement: `${registryUi}/$1` },
      { find: /^@jgengine\/core$/, replacement: `${src("core")}/index.ts` },
      { find: /^@jgengine\/core\/(.*)$/, replacement: `${src("core")}/$1` },
      { find: /^@jgengine\/react$/, replacement: `${src("react")}/index.ts` },
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
