import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHeadlessRunner, type HeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { onNewPlayer, systems } from "../loop";
import { world } from "../world";
import { baseBuilding, baseView } from "./base";
import { BAG, BAG_SLOTS, HOTBAR, HOTBAR_SLOTS } from "./bags";
import { content } from "./content";
import { recipeDef } from "./data/engrams";
import { itemTraits } from "./data/items";
import { craftBlock } from "./survivor";

function runner(): HeadlessRunner {
  const definition = defineGameDefinition({
    name: "Fernwild (test)",
    multiplayer: "off",
    world,
    inventories: { [BAG]: { slots: BAG_SLOTS, traits: itemTraits }, [HOTBAR]: { slots: HOTBAR_SLOTS, traits: itemTraits } },
    systems,
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

test("a campfire on the ground lets raw meat cook", () => {
  const game = runner();
  tick(game, 0.1);
  const cook = recipeDef("cook_meat")!;
  game.ctx.player.inventory.put(BAG, "raw_meat", 2);
  expect(craftBlock(game.ctx, cook)).toBe("Needs a Campfire");
  hold(game, "campfire");
  place(game, game.ctx.scene.entity.get(game.userId)!.rotationY);
  expect(baseBuilding(game.ctx).list().map((piece) => piece.pieceId)).toEqual(["campfire"]);
  expect(craftBlock(game.ctx, cook)).toBeNull();
});
