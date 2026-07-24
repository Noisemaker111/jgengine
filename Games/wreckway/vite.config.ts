import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const engineSrc = (pkg: string) => fileURLToPath(new URL(`../../packages/${pkg}/src`, import.meta.url));
const registryUi = fileURLToPath(new URL("../../registry/jgengine", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: existsSync(engineSrc("core"))
      ? [
          { find: /^@\/components\/ui\/(.*)$/, replacement: `${registryUi}/$1` },
          { find: /^@jgengine\/core\/(.*)$/, replacement: `${engineSrc("core")}/$1` },
          { find: /^@jgengine\/react\/(.*)$/, replacement: `${engineSrc("react")}/$1` },
          { find: /^@jgengine\/ws\/(.*)$/, replacement: `${engineSrc("ws")}/$1` },
          { find: /^@jgengine\/shell\/(.*)$/, replacement: `${engineSrc("shell")}/$1` },
          { find: /^@jgengine\/assets$/, replacement: `${engineSrc("assets")}/index.ts` },
          { find: /^@jgengine\/assets\/(.*)$/, replacement: `${engineSrc("assets")}/$1` },
        ]
      : [{ find: /^@\/components\/ui\/(.*)$/, replacement: `${registryUi}/$1` }],
  },
});
