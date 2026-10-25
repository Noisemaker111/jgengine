import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { viteIdleExit } from "../shared/viteIdleExit";
import { engineSource } from "../shared/viteEngineSource";

export default defineConfig({
  resolve: engineSource(new URL(".", import.meta.url)),
  plugins: [react(), tailwindcss(), viteIdleExit()],
});
