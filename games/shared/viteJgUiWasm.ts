import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type { Plugin } from "vite";

const MIME: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".d.ts": "text/plain; charset=utf-8",
  ".ttf": "font/ttf",
};

const wasmDir = fileURLToPath(new URL("../../native/wasm/jg-ui", import.meta.url));

function resolveFile(urlPath: string): string | null {
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, "");
  const file = normalize(join(wasmDir, rel));
  if (!file.startsWith(wasmDir + sep) && file !== wasmDir) return null;
  return existsSync(file) && statSync(file).isFile() ? file : null;
}

/**
 * What a page that draws engine UI needs from Vite. JSX in engine and game source compiles against
 * the engine's own runtime (`@jgengine/core/ui/jsx`), named here because Vite does not read it from
 * every package's tsconfig. And the jg-ui wasm bundle (`bun scripts/build-jg-ui-wasm.ts`) is served
 * at `/jg-ui/` in dev and copied into `dist/jg-ui/` on build, so `import("/jg-ui/jg_ui.js")` loads
 * the Rune UI layer.
 */
export function viteJgUiWasm(): Plugin {
  return {
    name: "jgengine:jg-ui-wasm",
    config() {
      return { oxc: { jsx: { runtime: "automatic", importSource: "@jgengine/core/ui/jsx" } } };
    },
    configureServer(server) {
      server.middlewares.use("/jg-ui", (req, res, next) => {
        const file = req.url === undefined ? null : resolveFile(req.url);
        if (file === null) {
          next();
          return;
        }
        res.setHeader("content-type", MIME[extname(file)] ?? "application/octet-stream");
        res.setHeader("cache-control", "no-cache");
        createReadStream(file).pipe(res);
      });
    },
    writeBundle(options) {
      const outDir = options.dir;
      if (outDir === undefined || !existsSync(wasmDir)) return;
      const walk = (from: string, to: string) => {
        for (const entry of readdirSync(from, { withFileTypes: true })) {
          const src = join(from, entry.name);
          const dst = join(to, entry.name);
          if (entry.isDirectory()) {
            walk(src, dst);
          } else {
            mkdirSync(dirname(dst), { recursive: true });
            copyFileSync(src, dst);
          }
        }
      };
      walk(wasmDir, join(outDir, "jg-ui"));
    },
  };
}
