import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { onNewPlayer, survivorStart, systems } from "../loop";
import { world } from "../world";
import { baseBuilding, baseSave, baseView, storeView } from "./base";
import { BAG, BAG_SLOTS, HOTBAR, HOTBAR_SLOTS } from "./bags";
import { content } from "./content";
import { recipeDef } from "./data/engrams";
import { itemTraits } from "./data/items";
import { craftBlock } from "./survivor";
import { openScreen } from "./screens";

function runner(): HeadlessRunner {
  const definition = defineGameDefinition({
    name: "Fernwild (test)",
    multiplayer: "off",
    world,
    inventories: { [BAG]: { slots: BAG_SLOTS, traits: itemTraits }, [HOTBAR]: { slots: HOTBAR_SLOTS, traits: itemTraits } },
    systems,
    newGame: survivorStart,
    loop: { onNewPlayer },
  });
  return createHeadlessRunner({ definition, content, loop: definition.loop! });
}

const tick = (game: HeadlessRunner, seconds: number, held: string[] = []) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) game.step(0.05, { held });
};

/** Put `count` of an item in hotbar slot 1 and hold it. */
function hold(game: HeadlessRunner, itemId: string, count = 1): void {
  game.ctx.player.inventory.put(HOTBAR, itemId, count);
  game.ctx.item.use.use({ from: game.userId, itemId, inventoryId: HOTBAR });
  tick(game, 0.1);
}

function place(game: HeadlessRunner, yaw: number): void {
  game.ui.tryInvoke("fire", { yaw });
  tick(game, 0.3);
}

test("build a thatch hut on the beach: foundation, three walls, a doorframe with a door, a roof", () => {
  const game = runner();
  tick(game, 0.1);
  const me = () => game.ctx.scene.entity.get(game.userId)!;
  const yaw = me().rotationY;
  const pieces = () => baseBuilding(game.ctx).list();

  hold(game, "thatch_foundation");
  expect(baseView(game.ctx).ghost).toMatchObject({ valid: true, mode: "ground" });
  place(game, yaw);
  expect(pieces().map((piece) => piece.pieceId)).toEqual(["thatch_foundation"]);
  expect(game.ctx.player.inventory.count(HOTBAR, "thatch_foundation")).toBe(0);
  const floor = pieces()[0]!;

  hold(game, "thatch_doorframe");
  expect(baseView(game.ctx).ghost).toMatchObject({ valid: true, mode: "snap" });
  place(game, yaw);
  hold(game, "thatch_wall", 3);
  for (let wall = 0; wall < 3; wall += 1) place(game, yaw);
  hold(game, "thatch_door");
  place(game, yaw);
  hold(game, "thatch_ceiling");
  place(game, yaw);

  const built = pieces();
  expect(built.map((piece) => piece.pieceId).sort()).toEqual(["thatch_ceiling", "thatch_door", "thatch_doorframe", "thatch_foundation", "thatch_wall", "thatch_wall", "thatch_wall"]);
  // Four sides on the four edges, the roof over the floor at wall height.
  const sides = built.filter((piece) => piece.pieceId === "thatch_wall" || piece.pieceId === "thatch_doorframe");
  expect(new Set(sides.map((piece) => `${Math.round(piece.position[0] - floor.position[0])},${Math.round(piece.position[2] - floor.position[2])}`)).size).toBe(4);
  const roof = built.find((piece) => piece.pieceId === "thatch_ceiling")!;
  expect(Math.hypot(roof.position[0] - floor.position[0], roof.position[2] - floor.position[2])).toBeLessThan(0.01);
  expect(roof.position[1] - floor.position[1]).toBeCloseTo(3);

  // The hut is solid: walking at it stops at the wall instead of walking onto the floor's middle.
  const solids = game.ctx.world.solids.layer("fernwild:base").length;
  expect(solids).toBe(built.length + 2);
  tick(game, 3, ["moveForward"]);
  expect(Math.hypot(me().position[0] - floor.position[0], me().position[2] - floor.position[2])).toBeGreaterThan(1.3);

  // The door swings open on its hinge, and the solids follow.
  const door = built.find((piece) => piece.pieceId === "thatch_door")!;
  const shut = baseBuilding(game.ctx).worldBoxes(door)[0]!.center;
  baseBuilding(game.ctx).toggle(door.id);
  tick(game, 0.1);
  const swung = game.ctx.world.solids.layer("fernwild:base").map((solid) => solid.center);
  expect(swung.some((center) => center.every((value, axis) => value === shut[axis]))).toBe(false);
});

test("fists chip thatch, and a broken wall takes the roof it held", () => {
  const game = runner();
  tick(game, 0.1);
  const yaw = game.ctx.scene.entity.get(game.userId)!.rotationY;
  hold(game, "thatch_foundation");
  place(game, yaw);
  hold(game, "thatch_wall");
  place(game, yaw);
  const building = baseBuilding(game.ctx);
  const wall = building.list().find((piece) => piece.pieceId === "thatch_wall")!;
  building.damage(wall.id, 1600 - 5, "fist");
  hold(game, "thatch_ceiling");
  place(game, yaw);
  expect(building.list()).toHaveLength(3);
  tick(game, 0.1);

  // Stand outside the wall and punch it: the wall goes, the roof falls with it.
  const floor = building.list().find((piece) => piece.pieceId === "thatch_foundation")!;
  const out = [wall.position[0] - floor.position[0], wall.position[2] - floor.position[2]] as const;
  const length = Math.hypot(out[0], out[1]);
  const x = wall.position[0] + (out[0] / length) * 1.2;
  const z = wall.position[2] + (out[1] / length) * 1.2;
  const towards = Math.atan2(-out[0], -out[1]);
  game.ctx.scene.entity.setPose(game.userId, { position: [x, game.ctx.world.groundHeightAt(x, z), z], rotationY: towards });
  for (let punch = 0; punch < 3 && building.get(wall.id) !== null; punch += 1) {
    game.ui.tryInvoke("fire", { yaw: towards });
    tick(game, 0.7);
  }
  expect(building.get(wall.id)).toBeNull();
  expect(building.list().map((piece) => piece.pieceId)).toEqual(["thatch_foundation"]);
});

test("a campfire lets raw meat cook only while it burns: wood on it lights it, and it goes out when the wood is gone", () => {
  const game = runner();
  tick(game, 0.1);
  const cook = recipeDef("cook_meat")!;
  game.ctx.player.inventory.put(BAG, "raw_meat", 2);
  expect(craftBlock(game.ctx, cook)).toBe("Needs a Campfire");
  hold(game, "campfire");
  place(game, game.ctx.scene.entity.get(game.userId)!.rotationY);
  expect(baseBuilding(game.ctx).list().map((piece) => piece.pieceId)).toEqual(["campfire"]);
  // Placed cold: nothing to burn yet.
  expect(craftBlock(game.ctx, cook)).toBe("Needs a Campfire");
  game.ctx.player.inventory.put(BAG, "wood", 1);
  tick(game, 0.1);
  game.ui.tryInvoke("structureUse", {});
  expect(game.ctx.player.inventory.count(BAG, "wood")).toBe(0);
  expect(craftBlock(game.ctx, cook)).toBeNull();
  // One wood burns about thirty seconds.
  tick(game, 25);
  expect(craftBlock(game.ctx, cook)).toBeNull();
  tick(game, 6);
  expect(craftBlock(game.ctx, cook)).toBe("Needs a Campfire");
});

test("a storage box holds fifteen stacks: E opens it, items go in and come back out, a save keeps them, and breaking it spills them into the bag", () => {
  const game = runner();
  tick(game, 0.1);
  hold(game, "storage_box");
  place(game, game.ctx.scene.entity.get(game.userId)!.rotationY);
  expect(baseBuilding(game.ctx).list().map((piece) => piece.pieceId)).toEqual(["storage_box"]);
  tick(game, 0.1);
  game.ui.tryInvoke("structureUse", {});
  expect(openScreen(game.ctx)).toBe("storage");
  expect(storeView(game.ctx)!.slots).toHaveLength(15);

  game.ctx.player.inventory.put(BAG, "stone", 60);
  const stoneSlot = () => game.ctx.player.inventory.state(BAG).slots.findIndex((slot) => slot?.itemId === "stone");
  game.ui.tryInvoke("storePut", { inventoryId: BAG, slot: stoneSlot() });
  expect(game.ctx.player.inventory.count(BAG, "stone")).toBe(0);
  expect(storeView(game.ctx)!.slots[0]).toEqual({ itemId: "stone", count: 60 });

  // A full box refuses more and the stack stays in the bag.
  for (let fill = 1; fill < 15; fill += 1) {
    game.ctx.player.inventory.put(BAG, "fiber", 300);
    game.ui.tryInvoke("storePut", { inventoryId: BAG, slot: game.ctx.player.inventory.state(BAG).slots.findIndex((slot) => slot?.itemId === "fiber") });
  }
  game.ctx.player.inventory.put(BAG, "wood", 5);
  game.ui.tryInvoke("storePut", { inventoryId: BAG, slot: game.ctx.player.inventory.state(BAG).slots.findIndex((slot) => slot?.itemId === "wood") });
  expect(game.ctx.player.inventory.count(BAG, "wood")).toBe(5);

  game.ui.tryInvoke("storeTake", { slot: 0 });
  expect(game.ctx.player.inventory.count(BAG, "stone")).toBe(60);
  game.ui.tryInvoke("storePut", { inventoryId: BAG, slot: stoneSlot() });
  game.ui.tryInvoke("closeStore", {});
  expect(openScreen(game.ctx)).toBeNull();

  // A save and a load keep what it holds.
  const save = baseSave(game.ctx);
  const data = JSON.parse(JSON.stringify(save.snapshot()));
  save.hydrate(data);
  game.ui.tryInvoke("structureUse", {});
  expect(storeView(game.ctx)!.slots.filter((slot) => slot !== null)).toHaveLength(15);
  game.ui.tryInvoke("closeStore", {});

  // Broken, what it held comes out into the bag.
  game.ui.tryInvoke("demolish", {});
  expect(baseBuilding(game.ctx).list()).toHaveLength(0);
  expect(game.ctx.player.inventory.count(BAG, "stone")).toBe(60);
});

/** Place a container in front, open it, and put `count` raw meat in it; returns the runner with it open. */
function stocked(pieceId: string, count: number): HeadlessRunner {
  const game = runner();
  tick(game, 0.1);
  hold(game, pieceId);
  place(game, game.ctx.scene.entity.get(game.userId)!.rotationY);
  tick(game, 0.1);
  game.ui.tryInvoke("structureUse", {});
  game.ctx.player.inventory.put(BAG, "raw_meat", count);
  game.ui.tryInvoke("storePut", { inventoryId: BAG, slot: game.ctx.player.inventory.state(BAG).slots.findIndex((slot) => slot?.itemId === "raw_meat") });
  return game;
}

const held = (game: HeadlessRunner, itemId: string) => storeView(game.ctx)!.slots.reduce((sum, slot) => sum + (slot?.itemId === itemId ? slot.count : 0), 0);
const wait = (game: HeadlessRunner, seconds: number) => {
  for (let t = 0; t < seconds; t += 5) game.step(5, { held: [] });
};

test("meat goes off in a storage box as fast as carried, and four times slower in a preserving bin, which takes only food", () => {
  const box = stocked("storage_box", 1);
  expect(held(box, "raw_meat")).toBe(1);
  wait(box, 610);
  expect(held(box, "raw_meat")).toBe(0);
  expect(held(box, "spoiled_meat")).toBe(1);

  const bin = stocked("preserving_bin", 1);
  expect(storeView(bin.ctx)!.slots).toHaveLength(6);
  expect(held(bin, "raw_meat")).toBe(1);
  wait(bin, 610);
  expect(held(bin, "raw_meat")).toBe(1);
  wait(bin, 1800);
  expect(held(bin, "raw_meat")).toBe(0);
  expect(held(bin, "spoiled_meat")).toBe(1);

  bin.ctx.player.inventory.put(BAG, "stone", 5);
  bin.ui.tryInvoke("storePut", { inventoryId: BAG, slot: bin.ctx.player.inventory.state(BAG).slots.findIndex((slot) => slot?.itemId === "stone") });
  expect(bin.ctx.player.inventory.count(BAG, "stone")).toBe(5);
  expect(held(bin, "stone")).toBe(0);
}, 60_000);

test("a hide sleeping bag is where the survivor wakes after dying, once: it is used up and the next death wakes on the beach", () => {
  const game = runner();
  tick(game, 0.1);
  const beach = [...game.ctx.scene.entity.get(game.userId)!.position];
  hold(game, "hide_sleeping_bag");
  game.ui.tryInvoke("cheat", { teleport: [beach[0]! + 40, beach[2]!] });
  tick(game, 0.1);
  place(game, game.ctx.scene.entity.get(game.userId)!.rotationY);
  const [bag] = baseBuilding(game.ctx).list();
  expect(bag?.pieceId).toBe("hide_sleeping_bag");
  const flat = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!);

  game.ui.tryInvoke("cheat", { teleport: [beach[0]! + 80, beach[2]!] });
  game.ui.tryInvoke("cheat", { kill: true });
  tick(game, 0.2);
  expect(flat(game.ctx.scene.entity.get(game.userId)!.position, bag!.position)).toBeLessThan(1);
  expect(baseBuilding(game.ctx).list()).toHaveLength(0);

  game.ui.tryInvoke("cheat", { kill: true });
  tick(game, 0.2);
  expect(flat(game.ctx.scene.entity.get(game.userId)!.position, beach)).toBeLessThan(1);
});
