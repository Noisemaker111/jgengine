import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { GARAGE, physics, world } from "../world";
import { initialize, keybinds, resumeRecord, seatPlayer, tick, viewStore, whenReady, whenWritten } from "./controls";
import { RECORD_ENTRY, SAVE_KEY, validHome } from "./save";
import { depart, newDive, newHome, recoverInterrupted, settle, takeLoot } from "./state";

function bankRifle() {
  const departure = depart(newHome());
  const looted = takeLoot(newDive(1), "fitter", "service-rifle", 4);
  if (!looted.ok) throw new Error(looted.message);
  return settle(departure, looted.dive, "extracted", "First armed return");
}

/** A real game context on a storage stub, booted from whatever bytes the stub holds. */
function world2(storage: { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }) {
  const ctx = createGameContext({ definition: defineGameDefinition({ name: "Prepared departure", world, physics, input: keybinds, persist: false, lifecycle: "always-live" }), player: { userId: "diver", isNew: true }, content: {} });
  initialize(ctx); seatPlayer(ctx);
  return ctx;
}

test("travel light keeps a recovered rifle safe; armed departure spends capacity and risks its exact instance", () => {
  const home = bankRifle(), rifle = home.stash[0]!;
  const light = depart(home);
  expect(light.stash).toEqual(home.stash);
  expect(newDive(2, light).cache).toEqual([]);
  expect(newDive(2, light).hand).toBe("sidearm");
  const armed = depart(home, rifle.id), dive = newDive(2, armed, rifle);
  expect(armed.stash).toEqual([]);
  expect(dive.hand).toBe("service-rifle");
  expect(dive.cache[0]).toMatchObject({ id: "1:fitter", x: 0, y: 0 });
  expect(rifle.level).toBe(4);
  const returned = settle(armed, dive, "extracted", "Rifle returned");
  expect(returned.stash).toEqual(home.stash);
  expect(validHome(returned)).toBe(true);
  expect(settle(armed, dive, "lost", "Fitter").stash).toEqual([]);
  expect(recoverInterrupted(armed).stash).toEqual([]);
  expect(() => depart(home, "missing")).toThrow("no longer banked");
});

test("the departure is one record: a refused write keeps the rifle banked, an accepted one saves the dive", async () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const home = bankRifle();
  const data = new Map<string, string>([[SAVE_KEY, JSON.stringify(home)]]);
  let rejectWrites = false;
  const storage = { getItem: (key: string) => data.get(key) ?? null, removeItem: (key: string) => { data.delete(key); }, setItem: (key: string, next: string) => { if (rejectWrites) throw new Error("disk full"); data.set(key, next); } };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  try {
    const ctx = world2(storage);
    await whenReady(ctx);
    ctx.game.commands.run("deepward.prepareRifle", { uid: "1:fitter" });
    expect(viewStore.read(ctx).rifleUid).toBeNull();
    viewStore.update(ctx, view => ({ ...view, panel: "stash" }));
    ctx.game.commands.run("deepward.prepareRifle", { uid: "1:fitter" });
    expect(viewStore.read(ctx).rifleUid).toBe("1:fitter");
    ctx.game.commands.run("deepward.close", {});
    ctx.scene.entity.setPose(ctx.player.userId, { position: GARAGE, dt: 0 });

    rejectWrites = true;
    ctx.game.commands.run("deepward.depart", {});
    await whenWritten(ctx);
    expect(viewStore.read(ctx).mode).toBe("home");
    expect(viewStore.read(ctx).error).toContain("disk full");
    const refused = JSON.parse(data.get(RECORD_ENTRY)!).value.systems.marrow;
    expect(refused.stash).toHaveLength(1);
    expect(refused.activeDive).toBeNull();

    rejectWrites = false;
    ctx.game.commands.run("deepward.depart", {});
    await whenWritten(ctx);
    expect(viewStore.read(ctx).dive!.hand).toBe("service-rifle");
    expect(viewStore.read(ctx).rifleUid).toBeNull();
    const document = JSON.parse(data.get(RECORD_ENTRY)!).value;
    expect(document.systems.marrow.stash).toEqual([]);
    expect(document.systems.run.mode).toBe("dive");
    expect(document.systems.run.dive.hand).toBe("service-rifle");
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("a reload mid-dive resumes the run the HUD was showing, not a lost Life", async () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, removeItem: (key: string) => { data.delete(key); }, setItem: (key: string, next: string) => { data.set(key, next); } };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  try {
    const first = world2(storage);
    await whenReady(first);
    first.scene.entity.setPose(first.player.userId, { position: GARAGE, dt: 0 });
    first.game.commands.run("deepward.depart", {});
    await whenWritten(first);
    const diving = viewStore.read(first);
    expect(diving.mode).toBe("dive");
    expect(diving.ammo!.loaded).toBe(6);
    // An accepted shot plus more than a checkpoint's worth of dive time: the HUD's round count is
    // now part of the record, which is what the reload must reproduce.
    first.input.publish([]);
    first.game.commands.run("deepwardFire", {});
    for (let frame = 0; frame < 30; frame++) first.sim.advance(0.05, dt => tick(first, dt));
    await whenWritten(first);
    const before = viewStore.read(first);
    expect(before.ammo!.loaded).toBe(5);

    // A second world booted from the same bytes is the reload: the title holds the record and
    // Continue is what puts the diver back in the dive with the round count it left.
    const second = world2(storage);
    await whenReady(second);
    const held = viewStore.read(second);
    expect(held.mode).toBe("home");
    expect(held.home.activeDive).toBe(before.home.activeDive);
    await resumeRecord(second);
    const after = viewStore.read(second);
    expect(after.mode).toBe("dive");
    expect(after.home.activeDive).toBe(before.home.activeDive);
    expect(after.home.life).toBe(before.home.life);
    expect(after.dive!.id).toBe(before.dive!.id);
    expect(after.dive!.hand).toBe(before.dive!.hand);
    expect(after.ammo!.loaded).toBe(before.ammo!.loaded);
    expect(after.ammo!.reserve).toBe(before.ammo!.reserve);
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
