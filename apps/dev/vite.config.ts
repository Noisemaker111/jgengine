import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const src = (pkg: string) => fileURLToPath(new URL(`../../packages/${pkg}/src`, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  build: { target: "es2022" },
  resolve: {
    extensions: [".ts", ".tsx", ".mjs", ".js", ".jsx", ".json"],
    alias: [
      { find: /^@jgengine\/core\/(.*)$/, replacement: `${src("core")}/$1` },
      { find: /^@jgengine\/react\/(.*)$/, replacement: `${src("react")}/$1` },
      { find: /^@jgengine\/ws\/(.*)$/, replacement: `${src("ws")}/$1` },
      { find: /^@jgengine\/shell\/(.*)$/, replacement: `${src("shell")}/$1` },
      { find: /^@jgengine\/assets$/, replacement: `${src("assets")}/index.ts` },
      { find: /^@jgengine\/assets\/(.*)$/, replacement: `${src("assets")}/$1` },
      {
        find: /^@dogfood\/world-of-warcraft$/,
        replacement: `${src("games/world-of-warcraft")}/index.ts`,
      },
      {
        find: /^@dogfood\/world-of-warcraft\/(.*)$/,
        replacement: `${src("games/world-of-warcraft")}/$1`,
      },
      {
        find: /^@dogfood\/asset-showcase$/,
        replacement: `${src("games/asset-showcase")}/index.tsx`,
      },
      {
        find: /^@dogfood\/asset-showcase\/(.*)$/,
        replacement: `${src("games/asset-showcase")}/$1`,
      },
      { find: /^@dogfood\/stress-bench$/, replacement: `${src("games/stress-bench")}/index.tsx` },
      { find: /^@dogfood\/stress-bench\/(.*)$/, replacement: `${src("games/stress-bench")}/$1` },
      { find: /^@dogfood\/destruction-demo$/, replacement: `${src("games/destruction-demo")}/index.tsx` },
      { find: /^@dogfood\/destruction-demo\/(.*)$/, replacement: `${src("games/destruction-demo")}/$1` },
    ],
  },
});
