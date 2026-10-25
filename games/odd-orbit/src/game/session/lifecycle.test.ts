import { expect, test } from "bun:test";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { game } from "../../game.config";
import { onInit, onTick } from "../../loop";
import { DAY_LENGTH } from "../../world";
import { checkpointOrbit, orbitSession } from "./lifecycle";
import { ORBIT_SAVE_KEY, validOrbitSave } from "./save";
import { householdStore } from "./store";

function boot() {
  const ctx = createGameContext({ definition: game.game, content: game.content, player: { userId: "orbit-lifecycle-test", isNew: true } });
  onInit(ctx);
  return ctx;
}

test("title and pause freeze the household; Continue restores a furnished timed checkpoint", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const records = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value),
  } });
  try {
    const first = boot();
    const menuHousehold = structuredClone(householdStore.read(first));
    expect(gamePhase(first)).toBe("menu");
    onTick(first, 5);
    expect(householdStore.read(first)).toEqual(menuHousehold);
    expect(records.has(ORBIT_SAVE_KEY)).toBe(false);
    first.game.commands.run("orbit.new", {});
    expect(gamePhase(first)).toBe("playing");
    const household = householdStore.read(first);
    householdStore.write(first, { ...household, credits: 321.25 });
    first.scene.object.place("sleep_pod", 10, first.world.groundHeightAt(10, 10), 10, { instanceId: "placed:sleep_pod:7" });
    first.time.advance(15);
    checkpointOrbit(first);
    const checkpoint = JSON.parse(records.get(ORBIT_SAVE_KEY)!);
    expect(validOrbitSave(checkpoint)).toBe(true);
    first.game.commands.run("orbit.pause", {});
    const paused = structuredClone(householdStore.read(first));
    const pausedTime = first.time.now();
    first.time.advance(10); onTick(first, 10);
    expect(householdStore.read(first)).toEqual(paused);
    expect(first.time.now()).toBe(pausedTime);

    const second = boot();
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

    records.set(ORBIT_SAVE_KEY, "broken");
    const damaged = boot();
    expect(orbitSession.read(damaged).saveStatus).toBe("damaged");
    expect(records.get(ORBIT_SAVE_KEY)).toBe("broken");
    damaged.game.commands.run("orbit.continue", {});
    expect(gamePhase(damaged)).toBe("menu");
    damaged.game.commands.run("orbit.new", {});
    expect(validOrbitSave(JSON.parse(records.get(ORBIT_SAVE_KEY)!))).toBe(true);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
