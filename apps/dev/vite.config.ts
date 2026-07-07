import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const src = (pkg: string) => fileURLToPath(new URL(`../../packages/${pkg}/src`, import.meta.url));
const game = (name: string) => fileURLToPath(new URL(`../../Games/${name}/src`, import.meta.url));

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
        find: /^@games\/world-of-warcraft$/,
        replacement: `${game("world-of-warcraft")}/index.ts`,
      },
      {
        find: /^@games\/world-of-warcraft\/(.*)$/,
        replacement: `${game("world-of-warcraft")}/$1`,
      },
      {
        find: /^@games\/asset-showcase$/,
        replacement: `${game("asset-showcase")}/index.tsx`,
      },
      {
        find: /^@games\/asset-showcase\/(.*)$/,
        replacement: `${game("asset-showcase")}/$1`,
      },
      { find: /^@games\/stress-bench$/, replacement: `${game("stress-bench")}/index.tsx` },
      { find: /^@games\/stress-bench\/(.*)$/, replacement: `${game("stress-bench")}/$1` },
      { find: /^@games\/destruction-demo$/, replacement: `${game("destruction-demo")}/index.tsx` },
      { find: /^@games\/destruction-demo\/(.*)$/, replacement: `${game("destruction-demo")}/$1` },
    ],
  },
});
