import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, type Plugin } from "vite";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const devAppRoot = fileURLToPath(new URL("../dev", import.meta.url));

let gamePlayerBuilt = false;

const gamesPlayerPlugin = (): Plugin => ({
  name: "games-player",
  apply: "build",
  buildStart() {
    if (gamePlayerBuilt) return;
    gamePlayerBuilt = true;
    const result = spawnSync("bun", ["run", "--cwd", devAppRoot, "build:site"], {
      stdio: "inherit",
    });
    if (result.status !== 0) {
      throw new Error("games-player: apps/dev build:site failed");
    }
  },
});

export default defineConfig({
  server: { port: 3000, fs: { allow: [repoRoot] } },
  plugins: [tailwindcss(), tanstackStart(), nitro(), viteReact(), gamesPlayerPlugin()],
});
