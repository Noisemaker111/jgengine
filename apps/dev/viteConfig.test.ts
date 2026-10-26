import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { loadConfigFromFile, type PluginOption } from "vite";

const configFile = fileURLToPath(new URL("./vite.config.ts", import.meta.url));

function pluginNames(plugins: PluginOption[] | undefined): string[] {
  return (plugins ?? []).flat(Infinity as 1).flatMap((plugin) => (plugin && typeof plugin === "object" && "name" in plugin ? [plugin.name] : []));
}

describe("the dev runner's vite config", () => {
  test("loads the way `vite` loads it and wires the F2 save path", async () => {
    const loaded = await loadConfigFromFile({ command: "serve", mode: "development" }, configFile, undefined, "silent");
    expect(loaded).not.toBeNull();
    expect(pluginNames(loaded?.config.plugins as PluginOption[])).toContain("jgengine-dev-save-loader");
  }, 60_000);
});
