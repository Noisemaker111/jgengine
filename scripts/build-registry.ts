import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REGISTRY_URL = "https://jgengine.com/r";

type RegistryFile = {
  path: string;
  type: string;
  target: string;
  content?: string;
};

type RegistryItem = {
  name: string;
  type: string;
  title: string;
  description: string;
  dependencies?: string[];
  registryDependencies?: string[];
  files: RegistryFile[];
  cssVars?: Record<string, Record<string, string>>;
  css?: Record<string, unknown>;
  docs?: string;
};

type RegistryIndex = {
  $schema: string;
  name: string;
  homepage: string;
  items: RegistryItem[];
};

const registryDir = fileURLToPath(new URL("../registry", import.meta.url));

export function buildRegistry(outDir: string): string[] {
  const index = JSON.parse(
    readFileSync(join(registryDir, "registry.json"), "utf8"),
  ) as RegistryIndex;
  if (index.name === undefined || index.homepage === undefined || !Array.isArray(index.items)) {
    throw new Error("registry.json must declare name, homepage, and items");
  }
  const localNames = new Set(index.items.map((item) => item.name));
  mkdirSync(outDir, { recursive: true });
  const written: string[] = [];
  for (const item of index.items) {
    for (const field of ["name", "type", "title", "description"] as const) {
      if (item[field] === undefined || item[field] === "") {
        throw new Error(`registry item is missing "${field}": ${JSON.stringify(item.name)}`);
      }
    }
    if (!Array.isArray(item.files) || item.files.length === 0) {
      throw new Error(`registry item "${item.name}" declares no files`);
    }
    const files = item.files.map((file) => {
      if (file.target === undefined || file.target === "") {
        throw new Error(`file "${file.path}" in "${item.name}" is missing a target`);
      }
      return { ...file, content: readFileSync(join(registryDir, file.path), "utf8") };
    });
    const registryDependencies = item.registryDependencies?.map((dep) =>
      localNames.has(dep) ? `${REGISTRY_URL}/${dep}.json` : dep,
    );
    const built = {
      $schema: "https://ui.shadcn.com/schema/registry-item.json",
      ...item,
      ...(registryDependencies === undefined ? {} : { registryDependencies }),
      files,
    };
    const outPath = join(outDir, `${item.name}.json`);
    writeFileSync(outPath, `${JSON.stringify(built, null, 2)}\n`);
    written.push(outPath);
  }
  const indexPath = join(outDir, "registry.json");
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  written.push(indexPath);
  return written;
}

if (import.meta.main) {
  const outDir =
    process.argv[2] ?? fileURLToPath(new URL("../apps/web/public/r", import.meta.url));
  const written = buildRegistry(outDir);
  console.log(`registry: wrote ${written.length} files to ${outDir}`);
}
