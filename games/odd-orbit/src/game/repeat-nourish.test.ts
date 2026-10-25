import { expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { game } from "../game.config";
import { registerCommands } from "./commands";
import { content } from "./content";
import { readOrbitSave, restoreOrbitSave, writeOrbitSave } from "./session/save";
import { householdStore } from "./session/store";
const USE_FULL = 98;
import { setupWorld } from "./sim/setup";
import { simulateHousehold } from "./sim/simulate";

function boot(): GameContext {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "repeat-nourish-test", isNew: true } });
  setupWorld(ctx);
  registerCommands(ctx);
  ctx.game.commands.define("orbit.checkpoint", { apply() {} });
  setGamePhase(ctx, "playing");
  return ctx;
}
function step(ctx: GameContext, seconds = 0.1): void { simulateHousehold(ctx, ctx.time.advance(seconds)); }
function firstMember(ctx: GameContext) {
  const state = householdStore.read(ctx);
  return state.members[state.order[0]!]!;
}
function font(ctx: GameContext) { return ctx.scene.object.get("starter:nutrient_font")!; }
function direct(ctx: GameContext): void { ctx.game.commands.run("member.direct", { id: firstMember(ctx).id, goal: "hunger" }); }
function click(ctx: GameContext): void {
  ctx.game.commands.run("member.select", { id: firstMember(ctx).id });
  ctx.game.commands.run("world.pointer", { point: { x: font(ctx).position[0], y: font(ctx).position[1], z: font(ctx).position[2] }, entity: null, object: font(ctx).instanceId });
}
function beginMeal(ctx: GameContext, order = direct): void {
  ctx.scene.entity.setPose(firstMember(ctx).id, { position: font(ctx).position });
  order(ctx);
  step(ctx);
  expect(firstMember(ctx).action).toEqual({ kind: "use", goal: "hunger", objId: font(ctx).instanceId });
}

for (const [name, order] of [["member.direct", direct], ["world.pointer", click]] as const) {
  test(`${name} repeats preserve one paid meal and let hunger recover`, () => {
    const ctx = boot();
    const pantry = householdStore.read(ctx).pantry;
    beginMeal(ctx, order);
    expect(householdStore.read(ctx).pantry).toBe(pantry - 1);
    const hunger = firstMember(ctx).needs.hunger;
    for (let repeat = 0; repeat < 8; repeat++) { order(ctx); step(ctx); }
    expect(householdStore.read(ctx).pantry).toBe(pantry - 1);
    expect(firstMember(ctx).needs.hunger).toBeGreaterThan(hunger + 5);
    expect(firstMember(ctx).assignedByPlayer).toBe(true);
    expect(firstMember(ctx).actionUntil).toBeGreaterThan(ctx.time.now() + 11);
    for (let frame = 0; frame < 40 && firstMember(ctx).action.kind === "use"; frame++) step(ctx);
    expect(firstMember(ctx).needs.hunger).toBeGreaterThanOrEqual(USE_FULL);
    expect(householdStore.read(ctx).pantry).toBe(pantry - 1);
  });
}

test("the last paid ration still completes after repeat direction and save/reload", () => {
  const ctx = boot();
  householdStore.read(ctx).pantry = 1; // A scarce-food fixture; the actual seek transition pays for the meal.
  beginMeal(ctx);
  expect(householdStore.read(ctx).pantry).toBe(0);
  const records = new Map<string, string>();
  const storage = { getItem: (key: string) => records.get(key) ?? null, setItem: (key: string, raw: string) => { records.set(key, raw); }, removeItem: (key: string) => { records.delete(key); } };
  expect(writeOrbitSave(ctx, storage)).toBe(true);
  const saved = readOrbitSave(storage).save;
  expect(saved).not.toBeNull();
  const restored = boot();
  restoreOrbitSave(restored, saved!);
  const hunger = firstMember(restored).needs.hunger;
  direct(restored);
  step(restored, 0.5);
  expect(firstMember(restored).action.kind).toBe("use");
  expect(firstMember(restored).needs.hunger).toBeGreaterThan(hunger);
  expect(householdStore.read(restored).pantry).toBe(0);
  for (let frame = 0; frame < 40 && firstMember(restored).action.kind === "use"; frame++) step(restored);
  expect(firstMember(restored).needs.hunger).toBeGreaterThanOrEqual(USE_FULL);
});

test("a new meal cannot start with an empty pantry", () => {
  const ctx = boot();
  householdStore.read(ctx).pantry = 0;
  ctx.scene.entity.setPose(firstMember(ctx).id, { position: font(ctx).position });
  const hunger = firstMember(ctx).needs.hunger;
  direct(ctx); step(ctx);
  expect(firstMember(ctx).action.kind).toBe("idle");
  expect(firstMember(ctx).concern).toContain("Pantry empty");
  expect(firstMember(ctx).needs.hunger).toBeLessThan(hunger);
  expect(householdStore.read(ctx).pantry).toBe(0);
});

test("clicking another font replaces the meal, while a different goal and release remain new intents", () => {
  const ctx = boot(); beginMeal(ctx);
  const otherId = ctx.scene.object.place("nutrient_font", 20, ctx.world.groundHeightAt(20, 20), 20, { instanceId: "test:other_font" });
  ctx.game.commands.run("member.select", { id: firstMember(ctx).id });
  ctx.game.commands.run("world.pointer", { point: { x: 20, y: 0, z: 20 }, entity: null, object: otherId });
  expect(firstMember(ctx).action).toEqual({ kind: "seek", goal: "hunger", objId: otherId });
  ctx.game.commands.run("member.direct", { id: firstMember(ctx).id, goal: "energy" });
  expect(firstMember(ctx).action).toMatchObject({ kind: "seek", goal: "energy" });
  ctx.game.commands.run("member.release", { id: firstMember(ctx).id });
  expect(firstMember(ctx).action).toEqual({ kind: "idle" });
  expect(firstMember(ctx).assignedByPlayer).toBe(false);
});

