/**
 * Curated core barrels (`@jgengine/core/<domain>`) — structural guards.
 * Proves each barrel re-exports its domain's intended public surface, stays in
 * sync with the generator, leaks no `@internal`/fixtures, and is wired into
 * package exports. Regenerate barrels with `bun run gen:barrels`.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { extractPackageSurface } from "./apiSurface";
import { CORE_BARRELS, collectBarrelReexports, renderBarrel } from "./gen-barrels";

const root = join(import.meta.dir, "..");
const surface = extractPackageSurface(join(root, "packages", "core"));

const publicByModule = new Map<string, Set<string>>();
for (const m of surface.modules) publicByModule.set(m.path, new Set(m.exports.map((e) => e.name)));

const REEXPORT_BLOCK = /export\s*\{([^}]*)\}\s*from\s*["']\.\/([^"']+)["']/g;
function parseReexports(src: string): { module: string; names: string[] }[] {
  const out: { module: string; names: string[] }[] = [];
  for (const match of src.matchAll(REEXPORT_BLOCK)) {
    const names = (match[1] ?? "")
      .split(",")
      .map((c) => c.trim().replace(/^type\s+/, ""))
      .filter((n) => n.length > 0);
    out.push({ module: match[2] ?? "", names });
  }
  return out;
}

const KEY_SYMBOL: Record<string, string> = {
  world: "createNavGrid",
  combat: "createAbilityKit",
  gameplay: "defineGame",
  multiplayer: "ChatTransport",
  ui: "formatDuration",
};

const pkg = JSON.parse(readFileSync(join(root, "packages/core/package.json"), "utf8")) as {
  exports: Record<string, unknown>;
};

describe("core domain barrels", () => {
  for (const { skill, barrel } of CORE_BARRELS) {
    describe(`@jgengine/core/${barrel}`, () => {
      const src = readFileSync(join(root, "packages/core/src", `${barrel}.ts`), "utf8");
      const blocks = parseReexports(src);
      const names = blocks.flatMap((b) => b.names);

      test("re-exports a non-empty curated surface", () => {
        expect(names.length).toBeGreaterThan(0);
      });

      test("stays in sync with the generator (run `bun run gen:barrels`)", () => {
        expect(src).toBe(renderBarrel(collectBarrelReexports(root, skill)));
      });

      test("every re-export is a real, non-@internal export of its module", () => {
        for (const { module, names: n } of blocks) {
          const pub = publicByModule.get(module);
          expect(pub, `barrel points at unknown module ./${module}`).toBeDefined();
          for (const name of n) expect(pub?.has(name), `${name} not a public export of ./${module}`).toBe(true);
        }
      });

      test("leaks no test fixtures", () => {
        expect(src).not.toMatch(/fixture/i);
        expect(src).not.toMatch(/\.test\b/);
      });

      test("exposes the domain's headline symbol", () => {
        expect(names).toContain(KEY_SYMBOL[barrel]);
      });

      test("is wired into package exports", () => {
        expect(pkg.exports[`./${barrel}`]).toEqual({
          types: `./dist/${barrel}.d.ts`,
          default: `./dist/${barrel}.js`,
        });
      });
    });
  }

  test("core package root stays VERSION/CHANGELOG only", () => {
    const index = readFileSync(join(root, "packages/core/src/index.ts"), "utf8");
    expect(index).toMatch(/VERSION/);
    expect(index).not.toMatch(/from\s+["']\.\/(world|combat|gameplay|multiplayer|ui|procedural)["']/);
  });
});
