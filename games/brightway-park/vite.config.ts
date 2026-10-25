import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { viteIdleExit } from "../shared/viteIdleExit";
import { viteProvisionAssets } from "../shared/provisionAssets";
import { engineSource } from "../shared/viteEngineSource";
import { appendFile } from "node:fs/promises";
import { join } from "node:path";

// Opt-in, event-driven diagnostics for native playtests. Never enabled in builds.
const evidenceDirectory = process.env.BRIGHTWAY_EVIDENCE_DIR;

export default defineConfig({
  resolve: engineSource(new URL(".", import.meta.url)),
  plugins: [react(), tailwindcss(), viteIdleExit(), viteProvisionAssets(), evidenceDirectory && {
    name: "brightway-native-evidence",
    apply: "serve",
    configureServer(server) {
      const record = (event: unknown) => appendFile(join(evidenceDirectory, "native-events.jsonl"), `${JSON.stringify(event)}\n`).catch(error => server.config.logger.error(String(error)));
      server.middlewares.use((req, res, next) => {
        res.on("finish", () => { if (res.statusCode >= 400) void record({ kind: "http-error", url: req.url, status: res.statusCode }); });
        if (req.url !== "/__brightway/evidence" || req.method !== "POST") { next(); return; }
        const chunks: Buffer[] = [];
        req.on("data", chunk => chunks.push(chunk));
        req.on("end", () => {
          try { void record(JSON.parse(Buffer.concat(chunks).toString())).then(() => { res.statusCode = 204; res.end(); }); }
          catch { res.statusCode = 400; res.end(); }
        });
      });
    },
  }],
  clearScreen: false,
  build: { target: "es2022" },
});
