import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

import { viteIdleExit } from "../shared/viteIdleExit";
import { viteJgUiWasm } from "../shared/viteJgUiWasm";
import { viteProvisionAssets } from "../shared/provisionAssets";
import { engineSource } from "../shared/viteEngineSource";

export default defineConfig({
  resolve: engineSource(new URL(".", import.meta.url)),
  plugins: [tailwindcss(), viteIdleExit(), viteJgUiWasm(), viteProvisionAssets()],
  clearScreen: false,
  build: { target: "es2022" },
  server: { watch: { ignored: ["**/.jgengine/**"] } },
});
