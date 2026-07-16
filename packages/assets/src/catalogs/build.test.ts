import { describe, expect, test } from "bun:test";

import { generatedIndex } from "../generated";
import { buildCatalog, entryUrl } from "./build";

describe("buildCatalog", () => {
  test("resolves an index id to a provider-pathed url", () => {
    const catalog = buildCatalog({ basePath: "/models" });
    const resolved = catalog.resolve("quaternius-stylized-nature/Pine_1");
    expect(resolved).not.toBeNull();
    expect(resolved?.url).toBe("/models/quaternius-stylized-nature/Pine_1.glb");
  });

  test("entryUrl strips trailing slashes from basePath", () => {
    const entry = { id: "s/a", source: "quaternius-modular-scifi", categories: ["scifi"], file: "a.glb" };
    expect(entryUrl("/models/", entry)).toBe("/models/quaternius-modular-scifi/a.glb");
  });

  test("aliases resolve to the same url as their target", () => {
    const catalog = buildCatalog({ basePath: "/models" });
    expect(catalog.resolve("nature/tree_pine")?.url).toBe(
      catalog.resolve("quaternius-stylized-nature/Pine_1")?.url,
    );
  });

  test("sources filter excludes other providers", () => {
    const catalog = buildCatalog({ basePath: "/models", sources: ["quaternius-modular-scifi"] });
    expect(catalog.has("quaternius-modular-scifi/Alien_Cyclop")).toBe(true);
    expect(catalog.has("quaternius-stylized-nature/Pine_1")).toBe(false);
  });

  test("every generated entry is registered", () => {
    const catalog = buildCatalog({ basePath: "/models" });
    for (const entry of generatedIndex) expect(catalog.has(entry.id)).toBe(true);
  });
});
