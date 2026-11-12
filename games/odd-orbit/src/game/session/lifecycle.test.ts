import { expect, test } from "bun:test";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { game } from "../../game.config";
import { onInit, onTick } from "../../loop";
import { DAY_LENGTH } from "../../world";
import { checkpointOrbit, orbitReady, orbitSession } from "./lifecycle";
import { orbitSlotKey, validOrbitSave } from "./save";
import { householdStore } from "./store";

/** Boot as the game does and wait for the boot read of the newest household. */
async function boot() {
  const ctx = createGameContext({ definition: game.game, content: game.content, player: { userId: "orbit-lifecycle-test", isNew: true } });
  onInit(ctx);
  await orbitReady(ctx);
  return ctx;
}

const SLOT_ONE = orbitSlotKey("household");
/** The household section of the document a slot's key holds. */
function household(raw: string | undefined): unknown {
  return raw === undefined ? undefined : JSON.parse(raw).value.systems.household;
}

test("title and pause freeze the household; Continue restores a furnished timed checkpoint", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const records = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value),
    removeItem: (key: string) => records.delete(key),
  } });
  try {
    const first = await boot();
    const menuHousehold = structuredClone(householdStore.read(first));
    expect(gamePhase(first)).toBe("menu");
    onTick(first, 5);
    expect(householdStore.read(first)).toEqual(menuHousehold);
    expect(records.has(SLOT_ONE)).toBe(false);
    first.game.commands.run("orbit.new", {});
    expect(gamePhase(first)).toBe("playing");
    const state = householdStore.read(first);
    householdStore.write(first, { ...state, credits: 321.25 });
    first.scene.object.place("sleep_pod", 10, first.world.groundHeightAt(10, 10), 10, { instanceId: "placed:sleep_pod:7" });
    first.time.advance(15);
    await checkpointOrbit(first);
    const checkpoint = household(records.get(SLOT_ONE)) as { clock: { now: number } };
    expect(validOrbitSave(checkpoint)).toBe(true);
    first.game.commands.run("orbit.pause", {});
    const paused = structuredClone(householdStore.read(first));
    const pausedTime = first.time.now();
    first.time.advance(10); onTick(first, 10);
    expect(householdStore.read(first)).toEqual(paused);
    expect(first.time.now()).toBe(pausedTime);

    const second = await boot();
    expect(orbitSession.read(second).screen).toBe("menu");
    expect(orbitSession.read(second).canContinue).toBe(true);
    expect(second.time.now()).toBe(checkpoint.clock.now);
    expect(householdStore.read(second).credits).toBe(321.25);
    expect(second.scene.object.get("placed:sleep_pod:7")).not.toBeNull();
    second.game.commands.run("orbit.continue", {});
    expect(gamePhase(second)).toBe("playing");
    expect(second.time.isPaused()).toBe(false);
    second.game.commands.run("orbit.new", {});
    expect(second.time.now()).toBeCloseTo(DAY_LENGTH * 9 / 24);
    expect(householdStore.read(second).credits).toBe(640);
    expect(second.scene.object.get("placed:sleep_pod:7")).toBeNull();
    // The new household's checkpoint lands asynchronously; let it settle before damaging the slot.
    await new Promise((resolve) => setTimeout(resolve, 0));

    records.set(SLOT_ONE, "broken");
    const damaged = await boot();
    expect(orbitSession.read(damaged).saveStatus).toBe("damaged");
    expect(records.get(SLOT_ONE)).toBe("broken");
    damaged.game.commands.run("orbit.continue", {});
    expect(gamePhase(damaged)).toBe("menu");
    damaged.game.commands.run("orbit.new", {});
    await orbitReady(damaged);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(validOrbitSave(household(records.get(SLOT_ONE)))).toBe(true);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("a household started before the boot read settles keeps the world it made", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const records = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value),
    removeItem: (key: string) => records.delete(key),
  } });
  try {
    const first = await boot();
    first.game.commands.run("orbit.new", {});
    householdStore.write(first, { ...householdStore.read(first), credits: 99 });
    await checkpointOrbit(first);
    const ctx = createGameContext({ definition: game.game, content: game.content, player: { userId: "orbit-lifecycle-test", isNew: true } });
    onInit(ctx);
    ctx.game.commands.run("orbit.new", {});
    await orbitReady(ctx);
    expect(gamePhase(ctx)).toBe("playing");
    expect(householdStore.read(ctx).credits).toBe(640);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
