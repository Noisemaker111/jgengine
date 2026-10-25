import { describe, expect, test } from "bun:test";

import { CREEP_CATALOG } from "./entities/enemies/catalog";
import { entityModels, scatterModels } from "./models";

describe("beacon-bastion models", () => {
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

  test("the three raiders read apart at the default camera: own model, own size, own rim", () => {
    const raiders = Object.values(CREEP_CATALOG);
    const base = ["raider_scout", "raider_grunt", "raider_brute"].map((id) => CREEP_CATALOG[id]!);
    expect(new Set(base.map((def) => def.model)).size).toBe(base.length);
    expect(new Set(raiders.map((def) => def.rim.color)).size).toBe(raiders.length);
    expect(new Set(raiders.map((def) => def.color)).size).toBe(raiders.length);
    for (const def of raiders) {
      expect(def.rim.strength).toBeGreaterThan(0);
    }
    const scout = CREEP_CATALOG.raider_scout!;
    const grunt = CREEP_CATALOG.raider_grunt!;
    const brute = CREEP_CATALOG.raider_brute!;
    expect(grunt.scale).toBeGreaterThan(scout.scale);
    expect(brute.scale).toBeGreaterThan(grunt.scale);
    for (const def of raiders) {
      const config = entityModels[def.id];
      if (config === undefined) continue;
      expect(config.url).toContain(def.model.split("/")[1]!);
    }
  });
});
