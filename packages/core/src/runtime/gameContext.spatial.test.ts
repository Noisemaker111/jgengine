import { expect, test } from "bun:test";
import { createGameContext } from "./gameContext";
import { defineGameDefinition } from "../game/defineGame";
import { createAssetCatalog } from "../scene/assetCatalog";

function context() {
  return createGameContext({ definition: defineGameDefinition({ name: "spatial-work", assets: createAssetCatalog(), multiplayer: "off" }), content: {}, player: { userId: "probe", isNew: true } });
}

test("runtime 5000-entity queries read only the moved/local candidates before subscribers", () => {
  const ctx = context();
  let reads = 0;
  for (let i = 0; i < 5000; i++) {
    const id = ctx.scene.entity.spawn("probe", { id: `e${i}`, position: [1000 + i * 16, 0, 1000] });
    const entity = ctx.scene.entity.get(id)!;
    let position = entity.position;
    Object.defineProperty(entity, "position", { configurable: true, enumerable: true,
      get() { reads++; return position; }, set(next) { position = next; } });
  }
  const ids = ctx.scene.entity.ids();
  let visits = 0;
  ids[Symbol.iterator] = function* () { for (let i = 0; i < this.length; i++) { visits++; yield this[i]!; } };
  expect(ctx.scene.entity.inRadius([0, 0, 0], 3)).toEqual([]);
  expect(reads).toBe(5000);
  expect(visits).toBeLessThanOrEqual(5000);
  visits = reads = 0;
  expect(ctx.scene.entity.inRadius([0, 0, 0], 3)).toEqual([]);
  expect([visits, reads]).toEqual([0, 0]);
  const tuple = [1, 0, 1] as const;
  ctx.scene.entity.setPose("e0", { position: tuple });
  expect(ctx.scene.entity.get("e0")?.position).toBe(tuple);
  expect(ctx.scene.entity.inRadius([0, 0, 0], 3)).toEqual(["e0"]);
  expect(visits).toBe(0);
  expect(reads).toBeLessThan(8);
  expect(ctx.scene.entity.ids()).toBe(ids);
  const observations: string[][] = [];
  const unsubscribe = ctx.subscribe(() => observations.push(ctx.scene.entity.inRadius([-8, 0, -8], 1)));
  ctx.scene.entity.setPose("e0", { position: [-8, 0, -8] });
  unsubscribe();
  expect(observations).toEqual([["e0"]]);
});

test("runtime spawn/replace/despawn/update/reset/hydrate restore spatial membership", () => {
  const ctx = context();
  const entity = ctx.scene.entity;
  entity.spawn("probe", { id: "a", position: [1, 0, 0] });
  const saved = ctx.state();
  expect(entity.inRadius([0, 0, 0], 2)).toEqual(["a"]);
  const immediate: string[][] = [];
  const unsubscribe = ctx.subscribe(() => immediate.push(entity.inRadius([0, 0, 0], 2)));
  entity.spawn("probe", { id: "b", position: [0, 0, 1] });
  expect(immediate.at(-1)).toEqual(["a", "b"]);
  entity.spawn("probe", { id: "b", onExisting: "replace", position: [100, 0, 0] });
  expect(immediate.at(-1)).toEqual(["a"]);
  entity.update("a", { position: [100, 0, 0] });
  expect(immediate.at(-1)).toEqual([]);
  entity.resetToSpawn("a");
  expect(immediate.at(-1)).toEqual(["a"]);
  entity.despawn("a");
  expect(immediate.at(-1)).toEqual([]);
  ctx.restore(saved);
  expect(entity.inRadius([0, 0, 0], 2)).toEqual(["a"]);
  expect(entity.ids()).toEqual(["a"]);
  const mirror = structuredClone(ctx.snapshot());
  entity.setPose("a", { position: [100, 0, 0] });
  ctx.hydrate(mirror);
  expect(entity.inRadius([0, 0, 0], 2)).toEqual(["a"]);
  entity.setPose("a", { position: [100, 0, 0] });
  entity.resetAllToSpawn();
  expect(entity.inRadius([0, 0, 0], 2)).toEqual(["a"]);
  const drop = ctx.scene.worldItem.spawn({ itemId: "probe-item", count: 1, position: [0, 0, 1] });
  expect(entity.inRadius([0, 0, 0], 2)).toEqual(["a", drop.instanceId]);
  ctx.scene.worldItem.pickup(drop.instanceId, "probe");
  expect(entity.inRadius([0, 0, 0], 2)).toEqual(["a"]);
  unsubscribe();
});
