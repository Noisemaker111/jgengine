import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

import { engineSource } from "../shared/viteEngineSource";
import { devBuilderPlugins } from "./vite.devPlugins";

const engine = engineSource(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [
    ...devBuilderPlugins(),
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
      { find: /^@\//, replacement: `${path.resolve(__dirname, "./src")}/` },
      // See vite.config.ts — resolves @llmville/game to source, bypassing
      // node_modules linking issues on Windows.
      { find: /^@llmville\/game/, replacement: path.resolve(__dirname, "./packages/game/src") },
    ],
  },
  server: {
    port: 3001,
    // Fail fast when another dev server already owns 3001 — auth SITE_URL trusts that port.
    strictPort: true,
  },
});
