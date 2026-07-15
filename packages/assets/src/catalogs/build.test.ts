import { describe, expect, test } from "bun:test";

import { generatedIndex } from "../generated";
import { buildCatalog, entryUrl } from "./build";

describe("buildCatalog", () => {
  test("entryUrl strips trailing slashes from basePath", () => {
    const entry = { id: "s/a", source: "quaternius-space", categories: ["space"], file: "a.glb" };
    expect(entryUrl("/models/", entry)).toBe("/models/quaternius-space/a.glb");
  });

  test("registers every bundled generated entry under a provider-pathed url", () => {
    const catalog = buildCatalog({ basePath: "/models" });
    for (const entry of generatedIndex) {
      expect(catalog.has(entry.id)).toBe(true);
      expect(catalog.resolve(entry.id)?.url).toBe(entryUrl("/models", entry));
    }
  });

  test("a source filter never admits an id outside the chosen sources", () => {
    const catalog = buildCatalog({ basePath: "/models", sources: ["quaternius-modular-scifi"] });
    for (const entry of generatedIndex) {
      if (entry.source !== "quaternius-modular-scifi") expect(catalog.has(entry.id)).toBe(false);
    }
  });
});
