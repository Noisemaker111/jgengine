/**
 * Curated per-domain barrels for `@jgengine/core`. Core's package root stays
 * VERSION/CHANGELOG only (see scripts/cutlistSurface.test.ts); each skill domain
 * gets a stable entrypoint `@jgengine/core/<domain>` so agents import from a
 * curated path instead of guessing deep file paths (critique #40).
 *
 * A barrel re-exports the domain's INTENDED public surface: non-`@internal`
 * exports that a game/example/app/sibling package actually imports, or that a
 * skill body references. Internal machinery and test fixtures stay out.
 *
 * Regenerate: `bun run gen:barrels`. Verified by scripts/barrels.test.ts.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { extractPackageSurface } from "./apiSurface";
import { collectAdoption, collectSkillTokens } from "./apiAdoption";
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
  { skill: "jgengine-procedural", barrel: "procedural" },
] as const;

export interface Reexport {
  importPath: string;
  values: string[];
  types: string[];
}

export function collectBarrelReexports(root: string, skill: string): Reexport[] {
  const surface = extractPackageSurface(join(root, "packages", "core"));
  const adoption = collectAdoption(root);
  const tokens = collectSkillTokens(root, skill);
  const used = (name: string): boolean => adoption.names.has(name) || tokens.has(name);

  const seen = new Set<string>();
  const byModule: Reexport[] = [];
  const sorted = [...surface.modules].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const module of sorted) {
    if (!module.path.includes("/")) continue;
    if (skillForModule("core", module.path) !== skill) continue;
    const values: string[] = [];
    const types: string[] = [];
    for (const e of [...module.exports].sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (!used(e.name) || seen.has(e.name)) continue;
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
    const reexports = collectBarrelReexports(root, skill);
    const out = join(root, "packages", "core", "src", `${barrel}.ts`);
    const next = renderBarrel(reexports);
    const prev = safeRead(out);
    writeFileSync(out, next);
    const count = reexports.reduce((n, r) => n + r.values.length + r.types.length, 0);
    console.log(`${prev === next ? "unchanged" : "wrote"} packages/core/src/${barrel}.ts (${count} symbols)`);
  }
}

if (import.meta.main) main();
