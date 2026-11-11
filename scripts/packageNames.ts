/**
 * A package's repo folder and its npm name can differ: `packages/ui` publishes as `@jgengine/react`.
 * Anything that turns a folder into an import path, an install location or a dependency goes
 * through here, so a folder name never leaks out as a package name npm does not have (0.56.0
 * published core depending on `@jgengine/ui`).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const packagesDir = fileURLToPath(new URL("../packages", import.meta.url));

let byFolder: Map<string, string> | null = null;

function names(): Map<string, string> {
  if (byFolder !== null) return byFolder;
  byFolder = new Map();
  for (const folder of readdirSync(packagesDir)) {
    const manifest = join(packagesDir, folder, "package.json");
    if (!existsSync(manifest)) continue;
    byFolder.set(folder, (JSON.parse(readFileSync(manifest, "utf8")) as { name: string }).name);
  }
  return byFolder;
}

/** The npm name `packages/<folder>` publishes as, e.g. `ui` → `@jgengine/react`. */
export function npmNameOfFolder(folder: string): string {
  const name = names().get(folder);
  if (name === undefined) throw new Error(`packages/${folder} has no package.json`);
  return name;
}

/** The repo folder under packages/ that publishes `npmName`, e.g. `@jgengine/react` → `ui`. */
export function folderOfNpmName(npmName: string): string {
  for (const [folder, name] of names()) if (name === npmName) return folder;
  throw new Error(`no folder under packages/ publishes ${npmName}`);
}
