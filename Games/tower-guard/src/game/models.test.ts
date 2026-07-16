import { describe, expect, test } from "bun:test";

import { entityModels, scatterModels } from "./models";

describe("tower-guard models", () => {
  test("soft-resolves art plan — empty until Quaternius/KayKit packs are pulled (#807)", () => {
    // Catalog indexes are empty on this branch until Batch 2 mirror/pull.
    // Keys only appear when pickModel finds a live catalog id.
    for (const config of Object.values(entityModels)) {
      expect(config.url.length).toBeGreaterThan(0);
      expect(config.url.includes("kenney")).toBe(false);
    }
    for (const id of Object.values(scatterModels)) {
      expect(id.includes("kenney")).toBe(false);
    }
  });
});
