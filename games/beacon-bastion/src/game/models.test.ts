import { describe, expect, test } from "bun:test";

import { BASE_CATALOG_ID } from "./entities/base/catalog";
import { CREEP_CATALOG } from "./entities/enemies/catalog";
import { TOWER_CATALOG } from "./entities/towers/catalog";
import { BUILDING_PLAN, buildingEntity, entityModels, scatterModels } from "./models";
import { renderEntity } from "./render/renderEntity";

describe("do not disturb models", () => {
  test("workers are Quaternius characters in work clothes; the town hall and buildings are town packs", () => {
    for (const def of Object.values(TOWER_CATALOG)) {
      expect(entityModels[def.id]?.url).toContain("/models/quaternius-animated-characters-pack/");
    }
    expect(entityModels[BASE_CATALOG_ID]?.url).toContain("quaternius-lowpoly-buildings");
    for (const id of Object.keys(BUILDING_PLAN)) expect(entityModels[buildingEntity(id)]?.url).toMatch(/\/models\/(kaykit-city-builder|quaternius-lowpoly-buildings)\//);
    for (const config of Object.values(scatterModels)) expect(config.url).toMatch(/\/models\/(kaykit-forest|kaykit-city-builder)\//);
    expect(scatterModels.tree).toBeDefined();
    expect(scatterModels.lamp).toBeDefined();
  });

  test("every trade has its own body", () => {
    const bodies = Object.values(TOWER_CATALOG).map((def) => def.model);
    expect(new Set(bodies).size).toBe(bodies.length);
  });

  test("tech has no catalog model: every piece draws its own procedural body", () => {
    for (const def of Object.values(CREEP_CATALOG)) {
      expect(entityModels[def.id]).toBeUndefined();
      const body = renderEntity({ id: `${def.id}-1`, name: def.id } as never);
      expect(body).not.toBeNull();
    }
    expect(renderEntity({ id: "worker_barista-1", name: "worker_barista" } as never)).toBeNull();
  });

  test("tech reads small to massive: earbuds, a phone, a fridge, a server rack, the data center", () => {
    const ladder = ["tech_earbuds", "tech_phone", "tech_fridge", "tech_server", "boss_datacenter"].map((id) => CREEP_CATALOG[id]!.scale);
    for (let index = 1; index < ladder.length; index += 1) expect(ladder[index]!).toBeGreaterThan(ladder[index - 1]!);
    expect(new Set(Object.values(CREEP_CATALOG).map((def) => def.mesh)).size).toBe(Object.keys(CREEP_CATALOG).length);
  });
});
