import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { GARAGE, physics, world } from "../world";
import { captureProbe, initialize, keybinds, seatPlayer, tick, viewStore, whenReady, whenWritten } from "./controls";
import { RECORD_ENTRY, SAVE_KEY } from "./save";
import { depart, newDive, newHome, settle, takeLoot } from "./state";

test("overlapping browser suspension intents stay paused until an explicit resume", async () => {
  const ctx = createGameContext({ definition: defineGameDefinition({ name: "Suspension boundary", world, physics, input: keybinds, persist: false, lifecycle: "always-live" }), player: { userId: "diver", isNew: true } });
  initialize(ctx);
  await whenReady(ctx);
  viewStore.update(ctx, view => ({ ...view, mode: "home", panel: null }));
  ctx.game.commands.run("deepward.pause", { paused: true });
  ctx.game.commands.run("deepward.pause", { paused: true });
  expect(viewStore.read(ctx).paused).toBe(true);
  expect(gamePhase(ctx)).toBe("paused");
  ctx.game.commands.run("deepward.pause", {});
  expect(viewStore.read(ctx).paused).toBe(false);
  expect(gamePhase(ctx)).toBe("playing");
});

test("real command/context boundary applies refits on departure and acknowledges loss across a fresh context", async () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const bank = depart(newHome());
  const first = takeLoot(newDive(1), "wire", "wire");
  const second = first.ok ? takeLoot(first.dive, "polymer", "polymer") : first;
  if (!second.ok) throw new Error(second.message);
  const data = new Map<string, string>([[SAVE_KEY, JSON.stringify(settle(bank, second.dive, "extracted", "Rail"))]]);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => data.get(key) ?? null, removeItem: (key: string) => { data.delete(key); }, setItem: (key: string, value: string) => { data.set(key, value); } } });
  /** The record's persistent section, as the next boot would read it. */
  const saved = () => JSON.parse(data.get(RECORD_ENTRY)!).value.systems.marrow;
  const create = async () => {
    const ctx = createGameContext({ definition: defineGameDefinition({ name: "Marrow boundary", world, physics, input: keybinds, persist: false, lifecycle: "always-live" }), player: { userId: "diver", isNew: true }, content: { entityById: id => id === "diver" ? { stats: { health: { max: 100 }, oxygen: { max: 110 }, ammo: { max: 6 } } } : id === "fitter" ? { stats: { health: { max: 80 } } } : null } });
    initialize(ctx); seatPlayer(ctx);
    await whenReady(ctx);
    return ctx;
  };
  try {
    const ctx = await create();
    ctx.game.commands.run("deepward.refit", { id: "tank" });
    expect(viewStore.read(ctx).home.refits).toEqual([]); // Station UI gate.
    viewStore.update(ctx, v => ({ ...v, panel: "stash" }));
    ctx.game.commands.run("deepward.refit", { id: "tank" });
    await whenWritten(ctx);
    expect(viewStore.read(ctx).home.refits).toEqual(["tank"]);
    expect(saved().stash).toEqual([]);
    const probe = captureProbe(ctx);
    expect(probe.tankRefit).toBe(1);
    probe.tankRefit = 0;
    expect(captureProbe(ctx).tankRefit).toBe(1);
    ctx.game.commands.run("deepward.refit", { id: "tank" });
    expect(viewStore.read(ctx).error).toContain("already installed");
    ctx.game.commands.run("deepward.close", {});
    ctx.scene.entity.setPose(ctx.player.userId, { position: GARAGE, dt: 0 });
    ctx.game.commands.run("deepward.depart", {});
    await whenWritten(ctx);
    expect(viewStore.read(ctx).dive!.oxygen).toBe(145);
    expect(captureProbe(ctx).inDive).toBe(1);
    expect(captureProbe(ctx).tankSeconds).toBe(145);
    expect(ctx.scene.entity.stats.get(ctx.player.userId, "oxygen")?.max).toBe(145);
    viewStore.update(ctx, v => ({ ...v, dive: { ...v.dive!, health: 0 } }));
    tick(ctx, 0.05);
    await whenWritten(ctx);
    expect(viewStore.read(ctx).mode).toBe("reprinting");
    expect(viewStore.read(ctx).dive).not.toBeNull(); // Failed view remains until acknowledgement.
    expect(saved().deaths).toBe(1);
    ctx.game.commands.run("deepward.depart", {});
    expect(viewStore.read(ctx).mode).toBe("reprinting");
    const reloaded = await create();
    expect(viewStore.read(reloaded).mode).toBe("reprinting");
    expect(viewStore.read(reloaded).home.deaths).toBe(1);
    reloaded.game.commands.run("deepward.acknowledgeReprint", {});
    await whenWritten(reloaded);
    expect(viewStore.read(reloaded).mode).toBe("home");
    expect(viewStore.read(reloaded).home.refits).toEqual(["tank"]);
    const revision = saved().revision;
    reloaded.game.commands.run("deepward.acknowledgeReprint", {});
    await whenWritten(reloaded);
    expect(saved().revision).toBe(revision);
    expect(viewStore.read(await create()).mode).toBe("home");
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
