import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveDependencyRange } from "./pkg";

describe("resolveDependencyRange", () => {
  function fixture(workspaces: unknown, run: (root: string, project: string) => void) {
    const root = mkdtempSync(join(tmpdir(), "jg-catalog-"));
    const project = join(root, "games", "probe");
    mkdirSync(project, { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({ workspaces }));
    writeFileSync(join(project, "package.json"), "{}");
    try { run(root, project); } finally { rmSync(root, { recursive: true, force: true }); }
  }

  test("resolves default and named catalog entries at the owning workspace", () => {
    fixture({ packages: ["games/*"], catalog: { "@jgengine/core": "0.18.1" }, catalogs: { preview: { "@jgengine/core": "^0.19.0" } } }, (root, project) => {
      expect(resolveDependencyRange(project, "@jgengine/core", "catalog:")).toEqual({ range: "0.18.1", catalogSource: `${join(root, "package.json")} workspaces.catalog` });
      expect(resolveDependencyRange(project, "@jgengine/core", "catalog:preview")).toEqual({ range: "^0.19.0", catalogSource: `${join(root, "package.json")} workspaces.catalogs.preview` });
    });
  });

  test("leaves normal npm pins and workspace protocol declarations unchanged", () => {
    for (const declared of ["^0.18.1", "0.18.1", "workspace:*", "~0.18.0"]) {
      expect(resolveDependencyRange(tmpdir(), "@jgengine/core", declared)).toEqual({ range: declared });
    }
  });

  test("a catalog declaration outside a workspace reports its missing owner", () => {
    fixture(undefined, (_root, project) => {
      expect(resolveDependencyRange(project, "@jgengine/core", "catalog:")).toEqual({ range: null, error: "@jgengine/core: catalog: requires a workspace catalog" });
    });
  });

  for (const catalog of [undefined, null, [], "0.18.1", {}, { "@jgengine/core": 18 }, { "@jgengine/core": "" }, { "@jgengine/core": "catalog:other" }]) {
    test(`rejects missing or malformed default catalog ${JSON.stringify(catalog)}`, () => {
      fixture({ packages: ["games/*"], catalog }, (_root, project) => {
        const result = resolveDependencyRange(project, "@jgengine/core", "catalog:");
        expect(result.range).toBeNull();
        expect(result.error).toContain("@jgengine/core: missing or malformed");
      });
    });
  }

  test("missing named catalogs cannot fall back to the default catalog", () => {
    fixture({ packages: ["games/*"], catalog: { "@jgengine/core": "0.18.1" } }, (_root, project) => {
      const result = resolveDependencyRange(project, "@jgengine/core", "catalog:missing");
      expect(result.range).toBeNull();
      expect(result.error).toContain("workspaces.catalogs.missing");
    });
  });

  test("malformed named catalog maps report their owning path", () => {
    fixture({ packages: ["games/*"], catalogs: { preview: [] } }, (root, project) => {
      const result = resolveDependencyRange(project, "@jgengine/core", "catalog:preview");
      expect(result.range).toBeNull();
      expect(result.error).toContain(`${join(root, "package.json")} workspaces.catalogs.preview`);
    });
  });

  test("the nearest workspace cannot inherit or hide a missing entry with an outer catalog", () => {
    fixture({ packages: ["games/*"], catalog: { "@jgengine/core": "0.18.1" } }, (_root, project) => {
      writeFileSync(join(project, "package.json"), JSON.stringify({ workspaces: { packages: ["nested/*"], catalog: {} } }));
      const nested = join(project, "nested", "child");
      mkdirSync(nested, { recursive: true });
      const result = resolveDependencyRange(nested, "@jgengine/core", "catalog:");
      expect(result.range).toBeNull();
      expect(result.catalogSource).toBe(`${join(project, "package.json")} workspaces.catalog`);
    });
  });
});
