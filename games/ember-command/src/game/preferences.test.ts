import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { COMMANDER_KEY, preferences, recordOutcome } from "./preferences";

test("commander stores isolate live worlds and retain the existing browser record", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  } });
  const boot = () => createGameContext({ definition: defineGameDefinition({ name: "Commander isolation" }), player: { userId: "commander", isNew: true } });
  try {
    const a = boot(), b = boot();
    const first = preferences(a), second = preferences(b);
    expect(preferences(a)).toBe(first);
    expect(second).not.toBe(first);
    let firstChanges = 0, secondChanges = 0;
    const unsubscribe = first.subscribe(() => { firstChanges++; });
    second.subscribe(() => { secondChanges++; });
    first.set({ largeText: true });
    recordOutcome(a, true, 42);
    expect(first.get()).toMatchObject({ largeText: true, wins: 1, bestVictory: 42 });
    expect(second.get()).toMatchObject({ largeText: false, wins: 0 });
    expect(firstChanges).toBe(2);
    expect(secondChanges).toBe(0);
    expect(JSON.parse(storage.get(COMMANDER_KEY)!)).toEqual(first.get());
    expect(preferences(boot()).get()).toEqual(first.get());
    unsubscribe();
    first.set({ highContrast: true });
    expect(firstChanges).toBe(2);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
