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
      { find: /^@games\/block-stacker$/, replacement: `${game("block-stacker")}/index.tsx` },
      { find: /^@games\/block-stacker\/(.*)$/, replacement: `${game("block-stacker")}/$1` },
      { find: /^@games\/maze-muncher$/, replacement: `${game("maze-muncher")}/index.tsx` },
      { find: /^@games\/maze-muncher\/(.*)$/, replacement: `${game("maze-muncher")}/$1` },
      { find: /^@games\/voxel-mine$/, replacement: `${game("voxel-mine")}/index.tsx` },
      { find: /^@games\/voxel-mine\/(.*)$/, replacement: `${game("voxel-mine")}/$1` },
      { find: /^@games\/platform-hopper$/, replacement: `${game("platform-hopper")}/index.tsx` },
      { find: /^@games\/platform-hopper\/(.*)$/, replacement: `${game("platform-hopper")}/$1` },
      { find: /^@games\/spire-cards$/, replacement: `${game("spire-cards")}/index.tsx` },
      { find: /^@games\/spire-cards\/(.*)$/, replacement: `${game("spire-cards")}/$1` },
    ],
  },
});
