import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { defineConfig } from "vite";

import { engineSource } from "../shared/viteEngineSource";
import { viteJgUiWasm } from "../shared/viteJgUiWasm";

const engine = engineSource(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [
    tailwindcss(),
    viteJgUiWasm(),
  ],
  resolve: {
    dedupe: engine.dedupe,
    alias: [
      ...engine.alias,
      // Resolve the workspace package straight to its source. Bypasses
      // node_modules linking, which breaks on Windows junctions (convex/esbuild)
      // and needs this when packages/game has no "exports" field.
      { find: /^@llmville\/game/, replacement: path.resolve(import.meta.dirname, "./packages/game/src") },
    ],
  },
  build: {
    rolldownOptions: {
      output: {
        // Split heavy, stable vendors into their own chunks. three.js only
        // load with the lazy game-session chunk (never on the landing page), and
        // pinning them to a stable hash lets the browser cache them across app
        // deploys and lets us preload them independently during the auth wait.
        codeSplitting: {
          groups: [
            { name: "three-vendor", test: /node_modules[\\/](three|three-stdlib)[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    port: 3001,
    // Fail fast when another dev server already owns 3001 — auth SITE_URL trusts that port.
    strictPort: true,
  },
});
