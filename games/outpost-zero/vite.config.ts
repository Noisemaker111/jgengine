import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { viteIdleExit } from "../shared/viteIdleExit";
import { viteProvisionAssets } from "../shared/provisionAssets";
import { engineSource } from "../shared/viteEngineSource";

const registryUi = fileURLToPath(new URL("../registry/jgengine", import.meta.url));

const engine = engineSource(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss(), viteIdleExit(), viteProvisionAssets()],
  clearScreen: false,
  build: { target: "es2022" },
  resolve: {
    dedupe: engine.dedupe,
    extensions: [".ts", ".tsx", ".mjs", ".js", ".jsx", ".json"],
    alias: [
      ...(existsSync(registryUi) ? [{ find: /^@\/components\/ui\/(.*)$/, replacement: `${registryUi}/$1` }] : []),
      ...engine.alias,
    ],
  },
});
