import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { viteIdleExit } from "../shared/viteIdleExit";
import { viteProvisionAssets } from "../shared/provisionAssets";
import { engineSource } from "../shared/viteEngineSource";

// The standalone harness consumes the published SDK, like the integrated host.
export default defineConfig({
  resolve: engineSource(new URL(".", import.meta.url)),
  plugins: [react(), tailwindcss(), viteIdleExit(), viteProvisionAssets()],
  clearScreen: false,
  build: { target: "es2022" },
  server: { host: "127.0.0.1", port: 4601, strictPort: true },
});
