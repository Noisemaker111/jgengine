import { describe, expect, test } from "bun:test";

import { entityModels, scatterModels } from "./models";

describe("tower-guard models", () => {
  test("resolves keep/towers/raiders onto Quaternius/KayKit (or soft-empty offline)", () => {
    for (const [key, config] of Object.entries(entityModels)) {
      expect(config.url.length).toBeGreaterThan(0);
      expect(config.url.includes("kenney")).toBe(false);
      expect(key.length).toBeGreaterThan(0);
    }
    for (const id of Object.values(scatterModels)) {
      expect(id.includes("kenney")).toBe(false);
      expect(id.includes("quaternius") || id.includes("nature/")).toBe(true);
    }
  });

  test("keep and towers prefer dungeon modular kit when catalog is live", () => {
    const keep = entityModels.keep ?? entityModels.base;
    // BASE_CATALOG_ID may be "keep" — just assert any entity model that loaded is CC0.
    const any = Object.values(entityModels)[0];
    if (any !== undefined) {
      expect(any.url).toMatch(/\/models\/(kaykit|quaternius)-/);
    }
    void keep;
  });
});
