/**
 * Curated per-domain barrels for `@jgengine/core`. Core's package root stays
 * VERSION/CHANGELOG only (see scripts/cutlistSurface.test.ts); each skill domain
 * gets a stable entrypoint `@jgengine/core/<domain>` so agents import from a
 * curated path instead of guessing deep file paths (critique #40).
 *
 * A barrel re-exports the domain's INTENDED public surface: non-`@internal`
 * exports already reviewed into the barrel. Consumer imports and prose do not
 * silently expand public API; add a symbol to the barrel deliberately.
 *
 * Regenerate: `bun run gen:barrels`. Verified by scripts/barrels.test.ts.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { extractPackageSurface } from "./apiSurface";
import { skillForModule } from "./skillRouting";

const TYPE_KINDS = new Set(["interface", "type"]);

export interface BarrelDomain {
  skill: string;
  barrel: string;
}

export const CORE_BARRELS: readonly BarrelDomain[] = [
  { skill: "jgengine-world", barrel: "world" },
  { skill: "jgengine-combat", barrel: "combat" },
  { skill: "jgengine-gameplay", barrel: "gameplay" },
  { skill: "jgengine-multiplayer", barrel: "multiplayer" },
  { skill: "jgengine-ui", barrel: "ui" },
] as const;

export interface Reexport {
  importPath: string;
  values: string[];
  types: string[];
}

function existingBarrelExports(root: string, skill: string): Map<string, Set<string>> {
  const barrel = CORE_BARRELS.find((entry) => entry.skill === skill)?.barrel;
  if (barrel === undefined) return new Map();
  const path = join(root, "packages", "core", "src", `${barrel}.ts`);
  if (!existsSync(path)) return new Map();
  const exportsByModule = new Map<string, Set<string>>();
  for (const block of readFileSync(path, "utf8").matchAll(/export\s*\{([\s\S]*?)\}\s*from\s*["']\.\/([^"']+)["']/g)) {
    const modulePath = block[2] ?? "";
    const symbols = exportsByModule.get(modulePath) ?? new Set<string>();
    for (const raw of (block[1] ?? "").split(",")) {
      const name = raw.trim().replace(/^type\s+/, "");
      if (name !== "") symbols.add(name);
    }
    exportsByModule.set(modulePath, symbols);
  }
  return exportsByModule;
}

export function collectBarrelReexports(root: string, skill: string): Reexport[] {
  const surface = extractPackageSurface(join(root, "packages", "core"));
  const existing = existingBarrelExports(root, skill);

  const seen = new Set<string>();
  const byModule: Reexport[] = [];
  const sorted = [...surface.modules].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const module of sorted) {
    if (!module.path.includes("/")) continue;
    const existingSymbols = existing.get(module.path) ?? new Set<string>();
    if (skillForModule("core", module.path) !== skill && existingSymbols.size === 0) continue;
    const values: string[] = [];
    const types: string[] = [];
    for (const e of [...module.exports].sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (!existingSymbols.has(e.name) || seen.has(e.name)) continue;
      seen.add(e.name);
      (TYPE_KINDS.has(e.kind) ? types : values).push(e.name);
    }
    if (values.length > 0 || types.length > 0) byModule.push({ importPath: module.path, values, types });
  }
  return byModule;
}

export function renderBarrel(reexports: Reexport[]): string {
  const lines: string[] = [];
  for (const r of reexports) {
    const names = [...r.values, ...r.types.map((t) => `type ${t}`)];
    const rel = `./${r.importPath}`;
    const single = `export { ${names.join(", ")} } from "${rel}";`;
    if (single.length <= 118) lines.push(single);
    else lines.push("export {", ...names.map((n) => `  ${n},`), `} from "${rel}";`);
  }
  return `${lines.join("\n")}\n`;
}

function safeRead(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function main(): void {
  const root = fileURLToPath(new URL("..", import.meta.url));
  for (const { skill, barrel } of CORE_BARRELS) {
    const out = join(root, "packages", "core", "src", `${barrel}.ts`);
    // Retired skills keep a frozen barrel (hand-curated after the skill left) — do not wipe.
    if (!existsSync(join(root, ".claude", "skills", skill))) {
      console.log(`skipped packages/core/src/${barrel}.ts (skill ${skill} retired — barrel frozen)`);
      continue;
    }
    const reexports = collectBarrelReexports(root, skill);
    const next = renderBarrel(reexports);
    const prev = safeRead(out);
    writeFileSync(out, next);
    const count = reexports.reduce((n, r) => n + r.values.length + r.types.length, 0);
    console.log(`${prev === next ? "unchanged" : "wrote"} packages/core/src/${barrel}.ts (${count} symbols)`);
  }
}

if (import.meta.main) main();
