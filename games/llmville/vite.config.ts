import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

import { engineSource } from "../shared/viteEngineSource";

const engine = engineSource(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackRouter({
      // Keep route components out of the startup bundle. Without this, the
      // generated route tree eagerly imports every page (including dev-only 3D
      // previews), which forces three.js/R3F into the first load of /, /login,
      // and /signup.
      autoCodeSplitting: true,
    }),
    react(),
  ],
  resolve: {
    dedupe: engine.dedupe,
    alias: [
      ...engine.alias,
      { find: /^@\//, replacement: `${path.resolve(import.meta.dirname, "./src")}/` },
      // Resolve the workspace package straight to its source. Bypasses
      // node_modules linking, which breaks on Windows junctions (convex/esbuild)
      // and needs this when packages/game has no "exports" field.
      { find: /^@llmville\/game/, replacement: path.resolve(import.meta.dirname, "./packages/game/src") },
    ],
  },
  build: {
    rolldownOptions: {
      output: {
        // Split heavy, stable vendors into their own chunks. three.js / R3F only
        // load with the lazy game-session chunk (never on the landing page), and
        // pinning them to a stable hash lets the browser cache them across app
        // deploys and lets us preload them independently during the auth wait.
        codeSplitting: {
          groups: [
            { name: "three-vendor", test: /node_modules[\\/](three|three-stdlib|@react-three)[\\/]/ },
            { name: "react-vendor", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 2 },
            { name: "router-vendor", test: /node_modules[\\/]@tanstack[\\/]/, priority: 2 },
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
