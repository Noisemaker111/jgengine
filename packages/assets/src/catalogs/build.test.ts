import { describe, expect, test } from "bun:test";

import { generatedIndex } from "../generated";
import { buildCatalog, entryUrl } from "./build";

describe("buildCatalog", () => {
  test("resolves an index id to a provider-pathed url", () => {
    const catalog = buildCatalog({ basePath: "/models" });
    const resolved = catalog.resolve("kenney-nature/tree_pineDefaultA");
    expect(resolved).not.toBeNull();
    expect(resolved?.url).toBe("/models/kenney-nature/tree_pineDefaultA.glb");
  });

  test("entryUrl strips trailing slashes from basePath", () => {
    const entry = { id: "s/a", source: "kenney-space", categories: ["space"], file: "a.glb" };
    expect(entryUrl("/models/", entry)).toBe("/models/kenney-space/a.glb");
  });

  test("aliases resolve to the same url as their target", () => {
    const catalog = buildCatalog({ basePath: "/models" });
    expect(catalog.resolve("nature/tree_pine")?.url).toBe(
      catalog.resolve("kenney-nature/tree_pineDefaultA")?.url,
    );
  });

  test("sources filter excludes other providers", () => {
    const catalog = buildCatalog({ basePath: "/models", sources: ["kenney-space"] });
    expect(catalog.has("kenney-space/astronautA")).toBe(true);
    expect(catalog.has("kenney-nature/tree_pineDefaultA")).toBe(false);
  });

  test("every generated entry is registered", () => {
    const catalog = buildCatalog({ basePath: "/models" });
    for (const entry of generatedIndex) expect(catalog.has(entry.id)).toBe(true);
  });
});
