import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, searchForWorkspaceRoot, type Plugin, type ProxyOptions } from "vite";

import { parseDevProxyTable } from "../../packages/core/src/data/devProxy";
import { tunableDiscoveryPlugin } from "../../packages/core/src/devtools/transformTunables";
import { devServerMarkerPlugin } from "../../scripts/devServerMarker";
import { startTextureCompression } from "../../games/shared/provisionAssets";
import { devReportPlugin } from "./devReportPlugin";
import { gamePublicPlugin } from "./gamePublicPlugin";

const src = (pkg: string) => fileURLToPath(new URL(`../../packages/${pkg}/src`, import.meta.url));
const game = (name: string) => fileURLToPath(new URL(`../../games/${name}/src`, import.meta.url));
const gamesDir = fileURLToPath(new URL("../../games", import.meta.url));
const studios = fileURLToPath(new URL("../../examples/studios/src", import.meta.url));
const registryUi = fileURLToPath(new URL("../../registry/jgengine", import.meta.url));

const devSaveModule = fileURLToPath(new URL("../../packages/node/src/devSavePlugin.ts", import.meta.url));

/**
 * The F2 save path (`@jgengine/node`'s `devSavePlugin`). It imports `@jgengine/core` by package name,
 * which only the running server's aliases resolve to source, so the server loads it rather than this
 * config file importing it.
 */
function devSave(servedDir: string | undefined): Plugin {
  return {
    name: "jgengine-dev-save-loader",
    apply: "serve",
    async configureServer(server) {
      const save = (await server.ssrLoadModule(devSaveModule)) as typeof import("../../packages/node/src/devSavePlugin");
      save.devSavePlugin(save.gamesSrcDir(gamesDir, servedDir)).configureServer(server);
    },
  };
}

/** Encode the games' KTX2 texture twins in the background; `gamePublicPlugin` serves each as it lands. */
function textureCompression(): Plugin {
  return {
    name: "jgengine-texture-compression",
    apply: "serve",
    configureServer() {
      startTextureCompression(gamesDir);
    },
  };
}

// Every workspace package resolves to its source, so the runner never needs a build.
const packagesDir = fileURLToPath(new URL("../../packages", import.meta.url));
const packageAliases = readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => {
    const manifest = join(packagesDir, entry.name, "package.json");
    return existsSync(manifest) && JSON.parse(readFileSync(manifest, "utf8")).name === `@jgengine/${entry.name}`;
  })
  .flatMap((entry) => {
    const name = entry.name;
    const index = join(src(name), "index.ts");
    return [
      ...(existsSync(index) ? [{ find: new RegExp(`^@jgengine/${name}$`), replacement: index }] : []),
      { find: new RegExp(`^@jgengine/${name}/(.*)$`), replacement: `${src(name)}/$1` },
    ];
  });

const gameAliases = existsSync(gamesDir)
  ? readdirSync(gamesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(gamesDir, entry.name, "src/index.tsx")))
      .flatMap((entry) => [
        { find: new RegExp(`^@games/${entry.name}$`), replacement: `${game(entry.name)}/index.tsx` },
        { find: new RegExp(`^@games/${entry.name}/(.*)$`), replacement: `${game(entry.name)}/$1` },
      ])
  : [];

const devProxyTable = parseDevProxyTable(process.env.VITE_JGENGINE_DEV_PROXY);

// `bun run shoot <game> --game-dir <path>` serves one game from another checkout. Its files are
// outside the workspace root, so Vite's allow-list has to name them or every game-local import 403s.
const servedGameDir = process.env.VITE_JG_GAME_DIR;
const allowedRoots = [
  searchForWorkspaceRoot(process.cwd()),
  ...(existsSync(gamesDir) ? [realpathSync(gamesDir)] : []),
  ...(servedGameDir !== undefined && servedGameDir !== "" && existsSync(servedGameDir) ? [realpathSync(servedGameDir)] : []),
];

const devProxy: Record<string, string | ProxyOptions> = Object.fromEntries(
  Object.entries(devProxyTable).map(([routeName, target]) => [
    `/proxy/${routeName}`,
    {
      target,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(new RegExp(`^/proxy/${routeName}`), ""),
    },
  ]),
);

export default defineConfig({
  plugins: [devServerMarkerPlugin({ kind: "runner" }), tunableDiscoveryPlugin(), devSave(servedGameDir), devReportPlugin(), gamePublicPlugin(servedGameDir, gamesDir), textureCompression(), react(), tailwindcss()],
  clearScreen: false,
  build: {
    target: "es2022",
  },
  server: {
    host: true,
    proxy: devProxy,
    // A game served with --game-dir can sit outside this workspace; Vite's default allow-list
    // would 403 game-local assets (src/**/*.glb) imported by URL.
    fs: { allow: allowedRoots },
  },
  resolve: {
    // Games sit outside this workspace package.
    // Resolve their shared runtime dependencies from apps/dev so Bun's workspace
    // links are used even when the importing file lives under ../../games.
    dedupe: ["react", "react-dom", "three", "@react-three/fiber", "@react-three/drei"],
    extensions: [".ts", ".tsx", ".mjs", ".js", ".jsx", ".json"],
    alias: [
      { find: /^@\/components\/ui\/(.*)$/, replacement: `${registryUi}/$1` },
      ...packageAliases,
      { find: /^@jgengine-examples\/studios$/, replacement: `${studios}/index.ts` },
      { find: /^@jgengine-examples\/studios\/(.*)$/, replacement: `${studios}/$1` },
      ...gameAliases,
    ],
  },
});
