import { afterEach, beforeEach, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { DEPART, physics, world } from "../world";
import { captureProbe, initialize, keybinds, nearby, seatPlayer, tickControls, viewStore, whenReady, whenWritten } from "./controls";
import { roomOf } from "./state";

const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
let data = new Map<string, string>();
beforeEach(() => {
  data = new Map();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k: string) => data.get(k) ?? null, removeItem: (k: string) => { data.delete(k); }, setItem: (k: string, v: string) => { data.set(k, v); } } });
});
afterEach(() => { if (original === undefined) Reflect.deleteProperty(globalThis, "localStorage"); else Object.defineProperty(globalThis, "localStorage", original); });

async function boot(): Promise<GameContext> {
  const ctx = createGameContext({ definition: defineGameDefinition({ name: "Crumb Run loop", world, physics, input: keybinds, persist: false, lifecycle: "always-live" }), player: { userId: "little", isNew: true }, content: { entityById: id => id === "little" ? { stats: { health: { max: 150 } } } : null } });
  initialize(ctx); seatPlayer(ctx);
  await whenReady(ctx);
  ctx.game.commands.run("deepward.enter", {});
  return ctx;
}
const stand = (ctx: GameContext, at: readonly [number, number, number]) => ctx.scene.entity.setPose(ctx.player.userId, { position: [at[0], 0, at[2]], dt: 0 });
function hold(ctx: GameContext, seconds: number) { for (let t = 0; t < seconds; t += 0.1) tickControls(ctx, 0.1); }

test("slip out, take a find, go a room deeper, come back and extract through the crack", async () => {
  const ctx = await boot();
  stand(ctx, DEPART.at);
  ctx.game.commands.run("deepward.depart", {});
  await whenWritten(ctx);
  expect(captureProbe(ctx).inRun).toBe(1);
  const first = viewStore.read(ctx).run!;
  // Take the first find the room offers (whatever it rolled).
  const loot = roomOf(first).loot.find(l => l.kind !== "toybox")!;
  stand(ctx, [loot.spot.at[0] + 0.5, 0, loot.spot.at[2] + 0.5]);
  ctx.game.commands.run("deepward.interact", {});
  hold(ctx, 2.2);
  expect(viewStore.read(ctx).run!.pack.length).toBeGreaterThan(0);
  // Through the first door, then back.
  const forward = roomOf(viewStore.read(ctx).run!).forwards[0]!;
  stand(ctx, forward.slot.at);
  ctx.game.commands.run("deepward.interact", {});
  hold(ctx, 4.2);
  const deeper = viewStore.read(ctx).run!;
  if (deeper.health > 0) {
    expect(deeper.room).toBe(forward.to);
    expect(captureProbe(ctx).depth).toBe(1);
    const entry = roomOf(deeper).entry.slot.at;
    stand(ctx, entry);
    expect(nearby(ctx)?.act.type).toBe("back");
    ctx.game.commands.run("deepward.interact", {});
    hold(ctx, 4.5);
    expect(viewStore.read(ctx).run!.room).toBe("0");
  }
  const crack = roomOf(viewStore.read(ctx).run!).exits.find(e => e.kind === "crack")!;
  stand(ctx, crack.at);
  const carried = viewStore.read(ctx).run!.pack.filter(i => i.baseId !== "bottle-cap").length;
  ctx.game.commands.run("deepward.interact", {});
  hold(ctx, 2);
  await whenWritten(ctx);
  const v = viewStore.read(ctx);
  expect(v.mode).toBe("home");
  expect(v.home.extractions).toBe(1);
  expect(v.home.stash.length).toBe(carried);
});

test("a reload mid-run resumes the same seeded house and room from the save", async () => {
  const ctx = await boot();
  stand(ctx, DEPART.at);
  ctx.game.commands.run("deepward.depart", {});
  await whenWritten(ctx);
  const seed = viewStore.read(ctx).run!.seed;
  const second = await boot();
  const { resumeRecord } = await import("./controls");
  await resumeRecord(second);
  const v = viewStore.read(second);
  expect(v.mode).toBe("run");
  expect(v.run!.seed).toBe(seed);
  expect(roomOf(v.run!).template.id).toBe(roomOf(viewStore.read(ctx).run!).template.id);
});

test("caught: health at zero loses the haul and waits for the Little to shake it off", async () => {
  const ctx = await boot();
  stand(ctx, DEPART.at);
  ctx.game.commands.run("deepward.depart", {});
  await whenWritten(ctx);
  viewStore.update(ctx, v => ({ ...v, run: { ...v.run!, health: 0, cause: "The Cat's paw came down on you." } }));
  hold(ctx, 0.2);
  await whenWritten(ctx);
  expect(viewStore.read(ctx).mode).toBe("caught");
  expect(viewStore.read(ctx).home.caught).toBe(1);
  ctx.game.commands.run("deepward.acknowledgeCaught", {});
  await whenWritten(ctx);
  expect(viewStore.read(ctx).mode).toBe("home");
});

test("the dawn clock ends a run that stays too long", async () => {
  const ctx = await boot();
  stand(ctx, DEPART.at);
  ctx.game.commands.run("deepward.depart", {});
  await whenWritten(ctx);
  viewStore.update(ctx, v => ({ ...v, run: { ...v.run!, elapsed: v.run!.nightSeconds + 59.95, threats: [] } }));
  hold(ctx, 0.3);
  await whenWritten(ctx);
  expect(viewStore.read(ctx).mode).toBe("caught");
  expect(viewStore.read(ctx).home.last?.reason).toContain("Morning");
});

test("building at the workbench spends the stash, and the nook only sends Littles who live here", async () => {
  const ctx = await boot();
  const { rollItem } = await import("./loot");
  viewStore.update(ctx, v => ({ ...v, home: { ...v.home, caps: 10, stash: (["crumb", "crumb", "raisin"] as const).map((k, i) => rollItem(k, 1, `s${i}`, `craft-${i + 1}:${k}`)) } }));
  ctx.game.commands.run("deepward.upgrade", { id: "larder" });
  await whenWritten(ctx);
  expect(viewStore.read(ctx).home.upgrades.larder).toBe(1);
  expect(viewStore.read(ctx).home.stash).toEqual([]);
  ctx.game.commands.run("deepward.chooseLittle", { id: "dot" });
  await whenWritten(ctx);
  expect(viewStore.read(ctx).home.little).toBe("pip");
  ctx.game.commands.run("deepward.chooseLittle", { id: "bolt" });
  await whenWritten(ctx);
  expect(viewStore.read(ctx).home.little).toBe("bolt");
});
