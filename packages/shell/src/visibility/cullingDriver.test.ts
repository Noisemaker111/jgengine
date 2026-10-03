import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import type { VisibilityConfig } from "@jgengine/core/visibility/config";
import { buildCullingDriver } from "./cullingDriver";

function fixture(config?: VisibilityConfig) {
  const definition = defineGameDefinition({ name: "culling", assets: createAssetCatalog() });
  const ctx = createGameContext({ definition, content: {}, player: { userId: "viewer", isNew: true } });
  const driver = buildCullingDriver(ctx, config);
  driver.setView({ kind: "orthographic", position: [0, 0, 0], target: [0, 0, -1], up: [0, 1, 0], halfWidth: 5, halfHeight: 5, near: 0.1, far: 100 });
  return { ctx, driver };
}

describe("shell culling driver", () => {
  test("keeps each always-visible row when a normal row is yielded last", () => {
    const { ctx, driver } = fixture({ entities: { beacon: { alwaysVisible: true } }, objects: { tower: { alwaysVisible: true } } });
    const first = ctx.scene.entity.spawn("beacon", { position: [1000, 0, 0] });
    const second = ctx.scene.entity.spawn("beacon", { position: [-1000, 0, 0] });
    const tower = ctx.scene.object.place("tower", 0, 1000, 0);
    const normal = ctx.scene.object.place("box", 1000, 1000, 0);

    driver.system.update();

    expect(driver.system.isVisible(first)).toBe(true);
    expect(driver.system.isVisible(second)).toBe(true);
    expect(driver.system.isVisible(tower)).toBe(true);
    expect(driver.system.isVisible(normal)).toBe(false);
    expect(driver.system.stats().visible).toBe(3);
  });

  test("invalidates bounds when a stationary object's scale changes", () => {
    const { ctx, driver } = fixture({ culling: { preloadMargin: 0, hysteresis: 0 } });
    const id = ctx.scene.object.place("box", 10, 0, -20, { visual: { scale: 1 } });
    driver.system.update();
    expect(driver.system.isVisible(id)).toBe(false);
    const bounds = driver.system.boundsOf(id)!;
    expect(bounds.radius).toBe(1);

    ctx.scene.object.setVisual(id, { scale: [7, 1, 1] });
    driver.system.update();
    expect(driver.system.boundsOf(id)).toBe(bounds);
    expect(bounds.radius).toBe(7);
    expect(driver.system.isVisible(id)).toBe(true);

    ctx.scene.object.setVisual(id, { scale: -2 });
    driver.system.update();
    expect(bounds.radius).toBe(2);
    expect(driver.system.isVisible(id)).toBe(false);
  });

  test("updates moving bounds and preserves core bounds identity", () => {
    const { ctx, driver } = fixture();
    const id = ctx.scene.object.place("box", 0, 0, -20);
    driver.system.update();
    const bounds = driver.system.boundsOf(id)!;
    ctx.scene.object.move(id, 30, 0, -20);
    driver.system.update();
    expect(driver.system.boundsOf(id)).toBe(bounds);
    expect(bounds.centerX).toBe(30);
    expect(driver.system.isVisible(id)).toBe(false);
  });

  test("refreshes a stationary row when its kind override is replaced", () => {
    const config: VisibilityConfig = { entities: { beacon: { alwaysVisible: true } } };
    const { ctx, driver } = fixture(config);
    const id = ctx.scene.entity.spawn("beacon", { position: [1000, 0, 0] });
    driver.system.update();
    expect(driver.system.isVisible(id)).toBe(true);
    config.entities!.beacon = { alwaysVisible: false };
    driver.system.update();
    expect(driver.system.isVisible(id)).toBe(false);
  });

  test("bounds shell tracking by live rows through repeated spawn and removal", () => {
    const { ctx, driver } = fixture();
    for (let wave = 0; wave < 100; wave += 1) {
      const entities = Array.from({ length: 10 }, () => ctx.scene.entity.spawn("actor", { position: [0, 0, -20] }));
      const objects = Array.from({ length: 10 }, () => ctx.scene.object.place("box", 0, 0, -20));
      driver.system.update();
      expect(driver.trackedCount()).toBe(20);
      for (const id of entities) ctx.scene.entity.despawn(id);
      for (const id of objects) ctx.scene.object.remove(id);
      driver.system.update();
      expect(driver.trackedCount()).toBe(0);
      expect(driver.system.stats().totalObjects).toBe(0);
      expect(driver.system.boundsOf(entities[0]!)).toBeUndefined();
      expect(driver.system.boundsOf(objects[0]!)).toBeUndefined();
    }
  });
});
