import { describe, expect, test } from "bun:test";

import { BASE_CATALOG_ID } from "./entities/base/catalog";
import { CREEP_CATALOG } from "./entities/enemies/catalog";
import { entityModels, scatterModels } from "./models";

describe("beacon-bastion models", () => {
  test("keep, towers, raiders and scatter all come from the one KayKit family", () => {
    for (const config of Object.values(entityModels)) {
      expect(config.url).toMatch(/\/models\/kaykit-/);
    }
    expect(entityModels[BASE_CATALOG_ID]?.url).toContain("building_castle");
    expect(entityModels.tower_archer?.url).toContain("building_tower");
    for (const config of Object.values(scatterModels)) {
      expect(config.url).toContain("/models/kaykit-forest/");
    }
    expect(scatterModels.pine).toBeDefined();
  });

  test("each armed raider carries its weapons in KayKit hand slots", () => {
    for (const def of Object.values(CREEP_CATALOG)) {
      const slots = (entityModels[def.id]?.attachments ?? []).map((attachment) => attachment.slot);
      expect(slots.includes("handslot.r")).toBe(def.gear?.right !== undefined);
      expect(slots.includes("handslot.l")).toBe(def.gear?.left !== undefined);
    }
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
