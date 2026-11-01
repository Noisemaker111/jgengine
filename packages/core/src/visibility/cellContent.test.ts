import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "../game/defineGame";
import { createGameContext } from "../runtime/gameContext";
import { createAssetCatalog } from "../scene/assetCatalog";
import { createCellContent, sceneEntityCells, sceneObjectCells } from "./cellContent";
import { createWorldStreamer, gridShards } from "./worldStreamer";

function makeContext() {
  return createGameContext({
    definition: defineGameDefinition({ name: "Cells", assets: createAssetCatalog(), multiplayer: "off" }),
    content: { entityById: () => ({}), objectById: () => ({}) },
    player: { userId: "user_a", isNew: true },
  });
}

const FAR = { min: [100, 0] as const, max: [200, 100] as const };

describe("createCellContent", () => {
  test("despawn saves a cell's props with their bodies and places them back a few per step", () => {
    const ctx = makeContext();
    const near = ctx.scene.object.place("crate", 10, 0, 10);
    const far = Array.from({ length: 5 }, (_, i) => ctx.scene.object.place("crate", 120 + i * 10, 0, 50, { rotation: 0.5, state: { open: i } }));
    ctx.scene.object.setColliders(far[0]!, { body: { name: "body", purpose: "physical", shape: { kind: "aabb", halfExtents: [1, 1, 1] }, blocks: true } });
    const cells = createCellContent({ rule: "despawn", adapter: sceneObjectCells(ctx.scene.object), restoresPerStep: 2 });
    expect(cells.unload("1,0", FAR)).toBe(5);
    expect(ctx.scene.object.ids()).toEqual([near]);
    const release = ctx.scene.object.retain(() => cells.parkedRecords().map((record) => record.object));
    expect(ctx.scene.object.snapshot().map((object) => object.instanceId).sort()).toEqual([near, ...far].sort());
    release();
    expect(ctx.scene.object.snapshot().length).toBe(1);
    cells.load("1,0");
    expect(cells.settled("1,0")).toBe(false);
    expect(cells.step()).toBe(2);
    expect(cells.step()).toBe(2);
    expect(cells.step()).toBe(1);
    expect(cells.settled("1,0")).toBe(true);
    expect(ctx.scene.object.get(far[3]!)?.state).toEqual({ open: 3 });
    expect(ctx.scene.object.get(far[3]!)?.rotationY).toBe(0.5);
    expect(ctx.scene.object.collidersOf(far[0]!)?.["body"]?.blocks).toBe(true);
  });

  test("freeze keeps an entity in the store, stopped and hidden, and thaws it as it was", () => {
    const ctx = makeContext();
    const npc = ctx.scene.entity.spawn("walker", { position: [150, 0, 50], role: "npc", movement: { walkSpeed: 3 } });
    const cells = createCellContent({ rule: "freeze", adapter: sceneEntityCells(ctx.scene.entity) });
    expect(cells.unload("1,0", FAR)).toBe(1);
    expect(cells.isFrozen(npc)).toBe(true);
    expect(ctx.scene.entity.get(npc)?.movement.frozen).toBe(true);
    expect(ctx.scene.entity.get(npc)?.hidden).toBe(true);
    const saved = JSON.parse(JSON.stringify(cells.snapshot()));
    const again = createCellContent({ rule: "simulate", adapter: sceneEntityCells(ctx.scene.entity) });
    again.restore(saved);
    again.load("1,0");
    expect(ctx.scene.entity.get(npc)?.movement).toEqual({ walkSpeed: 3, frozen: false });
    expect(ctx.scene.entity.get(npc)?.hidden).toBe(false);
  });

  test("despawn takes entities out with their state, never the player or a kept one", () => {
    const ctx = makeContext();
    const npc = ctx.scene.entity.spawn("walker", { position: [150, 0, 50], role: "npc", rotationY: 1.25, look: "red" });
    const car = ctx.scene.entity.spawn("car", { position: [160, 0, 50], role: "prop" });
    const player = ctx.scene.entity.spawn("hero", { position: [170, 0, 50], role: "player" });
    const kept = new Set([car]);
    const cells = createCellContent({ rule: "despawn", adapter: sceneEntityCells(ctx.scene.entity, { keep: (entity) => kept.has(entity.id) }) });
    expect(cells.unload("1,0", FAR)).toBe(1);
    expect(ctx.scene.entity.get(npc)).toBeNull();
    expect(ctx.scene.entity.get(car)).not.toBeNull();
    expect(ctx.scene.entity.get(player)).not.toBeNull();
    const saved = JSON.parse(JSON.stringify(cells.snapshot()));
    const copy = createCellContent({ rule: "despawn", adapter: sceneEntityCells(ctx.scene.entity) });
    copy.restore(saved);
    copy.load("1,0");
    copy.step();
    expect(ctx.scene.entity.get(npc)?.rotationY).toBe(1.25);
    expect(ctx.scene.entity.get(npc)?.look).toBe("red");
  });

  test("simulate leaves the cell alone", () => {
    const ctx = makeContext();
    ctx.scene.entity.spawn("walker", { position: [150, 0, 50], role: "npc" });
    const cells = createCellContent({ rule: "simulate", adapter: sceneEntityCells(ctx.scene.entity) });
    expect(cells.unload("1,0", FAR)).toBe(0);
    expect(cells.stats().parkedItems).toBe(0);
  });

  test("follows a world streamer: the far cell's props leave and come back as the focus returns", () => {
    const ctx = makeContext();
    for (let i = 0; i < 4; i += 1) ctx.scene.object.place("crate", 10 + i, 0, 10);
    for (let i = 0; i < 4; i += 1) ctx.scene.object.place("crate", 410 + i, 0, 10);
    const grid = gridShards({ min: [0, 0], max: [500, 100], cellSize: 100 });
    const bounds = new Map(grid.map((cell) => [cell.id, cell.bounds!]));
    const streamer = createWorldStreamer({ shards: grid, loadRadius: 50, keepRadius: 120, awaitReady: true });
    const cells = createCellContent({ rule: "despawn", adapter: sceneObjectCells(ctx.scene.object) });
    for (const cell of grid) cells.unload(cell.id, cell.bounds!);
    const tick = (x: number) => {
      const update = streamer.update({ x, z: 50 });
      for (const id of update.unload) cells.unload(id, bounds.get(id)!);
      for (const id of update.load) cells.load(id);
      cells.step();
      for (const id of streamer.resident()) if (streamer.state(id) === "loading" && cells.settled(id)) streamer.markReady(id);
    };
    tick(50);
    expect(ctx.scene.object.ids().length).toBe(4);
    expect(streamer.state("0,0")).toBe("ready");
    tick(450);
    expect(ctx.scene.object.list().every((object) => object.position[0] > 400)).toBe(true);
    tick(50);
    expect(ctx.scene.object.ids().length).toBe(4);
  });
});
