import { expect, test } from "bun:test";

import { defineGameDefinition } from "../game/defineGame";
import { createGameContext } from "../runtime/gameContext";

import { createCarrierField } from "./carrier";

function world() {
  const definition = defineGameDefinition({ name: "Carrier", multiplayer: "off" });
  const ctx = createGameContext({ definition, content: {}, player: { userId: "p1", isNew: true } });
  ctx.scene.entity.spawn("whale", { id: "whale", position: [0, 0, 0], role: "npc" });
  return ctx;
}

const DECK = { halfX: 2, halfZ: 4, height: 3 };

test("a body standing on the deck rides along as the carrier moves and turns; one beside it stays put", () => {
  const ctx = world();
  ctx.scene.entity.spawn("player", { id: "p1", position: [1, 3, 2], role: "player" });
  ctx.scene.entity.spawn("crab", { id: "crab", position: [6, 0, 0], role: "npc" });
  const field = createCarrierField();
  field.add("whale", DECK);
  field.step(ctx);
  // The whale walks 5 m forward and turns a quarter.
  ctx.scene.entity.setPose("whale", { position: [0, 0, 5], rotationY: Math.PI / 2 });
  expect(field.step(ctx)).toEqual(["p1"]);
  const rider = ctx.scene.entity.get("p1")!.position;
  // Local (1, 3, 2) under yaw π/2: right is world -Z, forward is world +X.
  expect(rider[0]).toBeCloseTo(2, 5);
  expect(rider[1]).toBeCloseTo(3, 5);
  expect(rider[2]).toBeCloseTo(5 - 1, 5);
  expect(ctx.scene.entity.get("crab")!.position).toEqual([6, 0, 0]);
  expect(field.passengersOf("whale")).toEqual(["p1"]);
});

test("attached props keep their place and turn; the deck is a solid walkers stand on", () => {
  const ctx = world();
  ctx.scene.entity.spawn("crate", { id: "crate", position: [0, 0, 0], role: "npc" });
  const field = createCarrierField({ solidsLayer: "decks" });
  field.add("whale", DECK);
  field.attach("whale", "crate", [0, 3, -2], 0.5);
  ctx.scene.entity.setPose("whale", { position: [10, 1, 0], rotationY: 0 });
  field.step(ctx);
  expect(ctx.scene.entity.get("crate")!.position).toEqual([10, 4, -2]);
  expect(ctx.scene.entity.get("crate")!.rotationY).toBeCloseTo(0.5, 5);
  expect(field.carries(ctx, "whale", "crate")).toBe(true);
  const solid = ctx.world.solids.layer("decks")[0]!;
  expect(solid.center[0]).toBeCloseTo(10, 5);
  expect(solid.center[1]).toBeCloseTo(1 + 3 - 0.2, 5);
  expect(solid.halfExtents).toEqual([2, 0.2, 4]);
});

test("someone who steps off the deck is no longer carried, and the state round-trips", () => {
  const ctx = world();
  ctx.scene.entity.spawn("player", { id: "p1", position: [0, 3, 0], role: "player" });
  const field = createCarrierField();
  field.add("whale", DECK);
  field.step(ctx);
  ctx.scene.entity.setPose("p1", { position: [5, 0, 0] });
  ctx.scene.entity.setPose("whale", { position: [0, 0, 3] });
  expect(field.step(ctx)).toEqual([]);
  expect(field.carries(ctx, "whale", "p1")).toBe(false);
  const copy = createCarrierField();
  copy.restore(field.snapshot());
  expect(copy.has("whale")).toBe(true);
  expect(copy.snapshot()).toEqual(field.snapshot());
});

test("a rider high over a tall carrier's deck, inside its stand tolerance, is carried too", () => {
  const ctx = world();
  // A tall walker: deck 8 m up, riders up to 4 m over it (the roof of a hut built there).
  ctx.scene.entity.spawn("player", { id: "p1", position: [0, 11.5, 0], role: "player" });
  const field = createCarrierField();
  field.add("whale", { halfX: 2, halfZ: 3, height: 8, standTolerance: 4 });
  field.step(ctx);
  ctx.scene.entity.setPose("whale", { position: [0, 0, 2] });
  expect(field.step(ctx)).toEqual(["p1"]);
  expect(ctx.scene.entity.get("p1")!.position[2]).toBeCloseTo(2, 5);
});
