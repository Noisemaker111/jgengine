import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

import { viteIdleExit } from "../shared/viteIdleExit";
import { viteProvisionAssets } from "../shared/provisionAssets";
import { engineSource } from "../shared/viteEngineSource";

export default defineConfig({
  plugins: [react(), tailwindcss(), viteIdleExit(), viteProvisionAssets()],
  clearScreen: false,
  build: { target: "es2022" },
  resolve: engineSource(new URL(".", import.meta.url)),
});
