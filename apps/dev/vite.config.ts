import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, searchForWorkspaceRoot, type ProxyOptions } from "vite";

import { parseDevProxyTable } from "../../packages/core/src/data/devProxy";
import { tunableDiscoveryPlugin } from "../../packages/core/src/devtools/transformTunables";
import { devSavePlugin } from "./devSavePlugin";
import { devReportPlugin } from "./devReportPlugin";

const src = (pkg: string) => fileURLToPath(new URL(`../../packages/${pkg}/src`, import.meta.url));
const game = (name: string) => fileURLToPath(new URL(`../../Games/${name}/src`, import.meta.url));
const gamesDir = fileURLToPath(new URL("../../Games", import.meta.url));
const studios = fileURLToPath(new URL("../../examples/studios/src", import.meta.url));
const registryUi = fileURLToPath(new URL("../../registry/jgengine", import.meta.url));

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
  plugins: [tunableDiscoveryPlugin(), devSavePlugin(gamesDir), devReportPlugin(), react(), tailwindcss()],
  clearScreen: false,
  build: {
    target: "es2022",
  },
  server: {
    host: true,
    proxy: devProxy,
    // `Games` is usually a symlink to a checkout outside this workspace; Vite's default allow-list
    // would 403 game-local assets (src/**/*.glb) imported by URL.
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), ...(existsSync(gamesDir) ? [realpathSync(gamesDir)] : [])] },
  },
  resolve: {
    // Games are cloned outside this workspace package during clean hosting builds.
    // Resolve their shared runtime dependencies from apps/dev so Bun's workspace
    // links are used even when the importing file lives under ../../Games.
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
