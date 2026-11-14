import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

import { viteIdleExit } from "../shared/viteIdleExit";
import { viteJgUiWasm } from "../shared/viteJgUiWasm";
import { viteProvisionAssets } from "../shared/provisionAssets";
import { engineSource } from "../shared/viteEngineSource";

// The standalone harness consumes the published SDK, like the integrated host.
export default defineConfig({
  resolve: engineSource(new URL(".", import.meta.url)),
  plugins: [tailwindcss(), viteIdleExit(), viteJgUiWasm(), viteProvisionAssets()],
  clearScreen: false,
  build: { target: "es2022" },
  server: { host: "127.0.0.1", port: 4601, strictPort: true },
});
