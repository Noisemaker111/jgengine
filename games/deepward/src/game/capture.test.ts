import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";

import { physics, world } from "../world";
import { initialize, seatPlayer, stageMidDive, viewStore, whenReady } from "./controls";

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

async function boot(): Promise<ReturnType<typeof createGameContext>> {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "Deepward and the mid-dive stage", world, physics, persist: false, lifecycle: "always-live" }),
    player: { userId: "diver", isNew: true },
    content: {
      entityById: (id) =>
        id === "diver"
          ? { stats: { health: { max: 100 }, oxygen: { max: 110 }, ammo: { max: 6 } } }
          : id === "fitter"
            ? { stats: { health: { max: 80 } } }
            : null,
    },
  });
  initialize(ctx);
  seatPlayer(ctx);
  await whenReady(ctx);
  return ctx;
}

function packOf(ctx: ReturnType<typeof createGameContext>): string {
  const dive = viewStore.read(ctx).dive;
  return dive === null ? "" : dive.cache.map((item) => item.id).sort().join(",");
}

test("mid-dive stage departs through the garage and loads the cache by searching", async () => {
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      removeItem: (key: string) => { memory.delete(key); },
      setItem: (key: string, value: string) => { memory.set(key, value); },
    },
  });
  try {
    const ctx = await boot();
    await stageMidDive(ctx);
    expect(viewStore.read(ctx).mode).toBe("dive");
    expect(viewStore.read(ctx).dive?.cache.length).toBe(3);
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("mid-dive stage reproduces its pack from a fresh boot", async () => {
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      removeItem: (key: string) => { memory.delete(key); },
      setItem: (key: string, value: string) => { memory.set(key, value); },
    },
  });
  try {
    const first = await boot();
    await stageMidDive(first);
    const pack = packOf(first);
    memory.clear();
    const second = await boot();
    await stageMidDive(second);
    expect(packOf(second)).toBe(pack);
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
