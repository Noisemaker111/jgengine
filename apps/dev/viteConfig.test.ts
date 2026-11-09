import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfigFromFile, type PluginOption } from "vite";

const configFile = fileURLToPath(new URL("./vite.config.ts", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

function pluginNames(plugins: PluginOption[] | undefined): string[] {
  return (plugins ?? []).flat(Infinity as 1).flatMap((plugin) => (plugin && typeof plugin === "object" && "name" in plugin ? [plugin.name] : []));
}

const SKIPPED_DIRS = new Set(["node_modules", "dist", "public", "src-tauri", ".next", ".scratch"]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name) && !entry.name.startsWith(".")) sourceFiles(join(dir, entry.name), out);
    } else if (/\.(css|ts)$/.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

describe("the dev runner's vite config", () => {
  test("loads the way `vite` loads it and wires the F2 save path", async () => {
    const loaded = await loadConfigFromFile({ command: "serve", mode: "development" }, configFile, undefined, "silent");
    expect(loaded).not.toBeNull();
    expect(pluginNames(loaded?.config.plugins as PluginOption[])).toContain("jgengine-dev-save-loader");
  }, 60_000);

  // Without `source(...)` Tailwind scans from the Vite root, and apps/dev's root holds public/ with
  // hundreds of MB of GLB models: every stylesheet then costs ~12 s CPU and ~700 MB in the dev server.
  test("every Tailwind stylesheet and template names the folder Tailwind scans", () => {
    const roots = ["apps", "games", "examples", "packages/jgengine/src/templates"].map((dir) => join(repoRoot, dir));
    const unscoped = roots
      .flatMap((root) => sourceFiles(root))
      .filter((file) => /@import\s+["']tailwindcss["']\s*;/.test(readFileSync(file, "utf8")))
      .map((file) => relative(repoRoot, file));
    expect(unscoped).toEqual([]);
  });
});
