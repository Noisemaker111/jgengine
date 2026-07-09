import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const here = import.meta.dir;
const pkgRoot = resolve(here, "..");
const repoRoot = resolve(pkgRoot, "..", "..");
const registryDir = join(repoRoot, "registry");
const out = join(pkgRoot, "src", "registry-catalog.json");

interface RegistryItem {
  name: string;
  title?: string;
  description?: string;
  type?: string;
}

const registry = JSON.parse(readFileSync(join(registryDir, "registry.json"), "utf8")) as {
  homepage: string;
  items: RegistryItem[];
};

const components = registry.items
  .filter((item) => item.name !== "game-icon")
  .map((item) => ({
    name: item.name,
    title: item.title ?? item.name,
    description: item.description ?? "",
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const iconSource = readFileSync(join(registryDir, "jgengine", "game-icon.tsx"), "utf8");
const iconBlock = iconSource.match(/GAME_ICON_NAMES\s*=\s*\[([\s\S]*?)\]/);
if (iconBlock === null) throw new Error("gen-registry-catalog: could not find GAME_ICON_NAMES in game-icon.tsx");
const icons = Array.from(iconBlock[1]!.matchAll(/"([^"]+)"/g), (match) => match[1]!).sort((a, b) =>
  a.localeCompare(b),
);

const catalog = { homepage: registry.homepage, components, icons };
writeFileSync(out, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(
  `gen-registry-catalog: wrote ${components.length} component(s) + ${icons.length} icon(s) -> ${out}`,
);
