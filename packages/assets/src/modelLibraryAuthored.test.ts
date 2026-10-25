import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MODEL_LIBRARY } from "./catalogs/modelLibrary";
import { AUTHORED_BUILDERS, buildAuthoredModel } from "./modelLibraryAuthored";

describe("authored library models", () => {
  test("every authored entry names a builder that exists", () => {
    const authored = MODEL_LIBRARY.filter((entry) => entry.origin.provider === "authored");
    expect(authored.length).toBeGreaterThanOrEqual(2);
    for (const entry of authored) if (entry.origin.provider === "authored") expect(AUTHORED_BUILDERS[entry.origin.builder]).toBeDefined();
  });

  test("the server rack builds into a small meshopt GLB at real size", async () => {
    const root = mkdtempSync(join(tmpdir(), "authored-")); // fixture-location: allow writes plain GLB bytes, nothing resolves @jgengine imports from it
    try {
      const rack = MODEL_LIBRARY.find((entry) => entry.name === "scifi/server-rack")!;
      const built = await buildAuthoredModel(rack, root);
      expect(built.triangles).toBeGreaterThan(100);
      expect(statSync(built.file).size).toBe(built.bytes);
      expect(built.bytes).toBeLessThan(200_000);
      const { document } = AUTHORED_BUILDERS["server-rack"]!();
      const names = document.getRoot().listNodes().map((node) => node.getName());
      expect(names.some((name) => /server/i.test(name))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
