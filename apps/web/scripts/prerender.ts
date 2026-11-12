// `bun scripts/prerender.ts` (run by `bun run build` after `vite build`): writes every page of the
// site as a static HTML file into dist/client, drawn by the engine's own JSX renderer through
// `src/site/render.tsx`, linking the hashed files the client build made. Also writes 404.html,
// which the Worker serves for any path with no page, and sitemap.xml listing every page written.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

import type { PageAssets } from "../src/site/render";
import { pageFile } from "../src/site/routes";
import { gamesIndexPlugin, siteAliases } from "../vite.site";

const webRoot = fileURLToPath(new URL("..", import.meta.url));
const clientDir = join(webRoot, "dist", "client");

interface ManifestChunk {
  file: string;
  css?: string[];
  imports?: string[];
}

/** The fonts the first screen draws with; preloaded so headings do not swap faces. */
const PRELOADED_FONTS = ["archivo-latin-wdth-normal", "inter-latin-wght-normal", "jetbrains-mono-latin-wght-normal"];

function fail(message: string): never {
  console.error(`prerender FAILED: ${message}`);
  process.exit(1);
}

const manifestPath = join(clientDir, ".vite", "manifest.json");
if (!existsSync(manifestPath)) fail(`no client build manifest at ${manifestPath}; run vite build first`);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, ManifestChunk>;

const chunk = (key: string): ManifestChunk => manifest[key] ?? fail(`the client build has no chunk for ${key}`);

/** A chunk's own file, the chunks it statically imports, and all their CSS. */
function closure(key: string, js: Set<string>, css: Set<string>): void {
  const entry = chunk(key);
  if (js.has(entry.file)) return;
  js.add(entry.file);
  for (const file of entry.css ?? []) css.add(file);
  for (const imported of entry.imports ?? []) closure(imported, js, css);
}

const assetFiles = readdirSync(join(clientDir, "assets"));
const fonts = PRELOADED_FONTS.map((stem) => {
  const file = assetFiles.find((name) => name.startsWith(`${stem}-`) && name.endsWith(".woff2"));
  return file === undefined ? fail(`no built font ${stem}-*.woff2 in dist/client/assets`) : `/assets/${file}`;
});

const client = chunk("src/client.tsx");
const styles = chunk("src/styles.css");

function assetsFor(source: string | null): PageAssets {
  const js = new Set<string>();
  const css = new Set<string>();
  closure("src/client.tsx", js, css);
  if (source !== null) closure(source, js, css);
  js.delete(client.file);
  return {
    stylesheets: [styles.file, ...css].map((file) => `/${file}`),
    fonts,
    modulePreloads: [...js].map((file) => `/${file}`),
    scripts: [`/${client.file}`],
    analytics: true,
  };
}

const server = await createServer({
  configFile: false,
  root: webRoot,
  appType: "custom",
  logLevel: "warn",
  server: { middlewareMode: true, hmr: false, ws: false },
  resolve: { alias: siteAliases },
  plugins: [gamesIndexPlugin()],
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  const render = (await server.ssrLoadModule("/src/site/render.tsx")) as typeof import("../src/site/render");
  const paths = render.pagePaths();
  for (const path of paths) {
    const page = await render.renderPage(path, assetsFor);
    if (page.status !== 200) fail(`${path} rendered status ${page.status}`);
    const out = join(clientDir, pageFile(path));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, page.html);
  }
  const missing = await render.renderPage("/404", assetsFor);
  if (missing.status !== 404) fail(`the not-found page rendered status ${missing.status}`);
  writeFileSync(join(clientDir, "404.html"), missing.html);
  writeFileSync(join(clientDir, "sitemap.xml"), render.renderSitemap());
  console.log(`prerender: ${paths.length} pages, 404.html and sitemap.xml written to dist/client`);
} finally {
  await server.close();
}
