import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { devSavePlugin } from "../../apps/dev/devSavePlugin";

const engineSrc = (pkg: string) => fileURLToPath(new URL(`../../packages/${pkg}/src`, import.meta.url));
const gamesDir = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss(), devSavePlugin(gamesDir)],
  clearScreen: false,
  build: { target: "es2022" },
  resolve: {
    extensions: [".ts", ".tsx", ".mjs", ".js", ".jsx", ".json"],
    alias: existsSync(engineSrc("core"))
      ? [
          { find: /^@jgengine\/core\/(.*)$/, replacement: `${engineSrc("core")}/$1` },
          { find: /^@jgengine\/react\/(.*)$/, replacement: `${engineSrc("react")}/$1` },
          { find: /^@jgengine\/ws\/(.*)$/, replacement: `${engineSrc("ws")}/$1` },
          { find: /^@jgengine\/shell\/(.*)$/, replacement: `${engineSrc("shell")}/$1` },
          { find: /^@jgengine\/editor$/, replacement: `${engineSrc("editor")}/index.ts` },
          { find: /^@jgengine\/editor\/(.*)$/, replacement: `${engineSrc("editor")}/$1` },
          { find: /^@jgengine\/assets$/, replacement: `${engineSrc("assets")}/index.ts` },
          { find: /^@jgengine\/assets\/(.*)$/, replacement: `${engineSrc("assets")}/$1` },
        ]
      : [],
  },
});
