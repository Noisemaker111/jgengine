import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { COMMANDER_KEY, COMMANDER_SAVE_KEY, COMMANDER_SLOT, preferences, recordOutcome } from "./preferences";

/** Run `body` against a stubbed browser storage, restoring the real one after. */
async function withStorage(body: (storage: Map<string, string>) => Promise<void>): Promise<void> {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } });
  try { await body(storage); }
  finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
}

const boot = () => createGameContext({ definition: defineGameDefinition({ name: "Commander isolation" }), player: { userId: "commander", isNew: true } });
/** Writes land asynchronously; let the ones a change started settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("commander stores isolate live worlds and retain the existing browser record", async () => {
  await withStorage(async (storage) => {
    const a = boot(), b = boot();
    const first = preferences(a), second = preferences(b);
    expect(preferences(a)).toBe(first);
    expect(second).not.toBe(first);
    await Promise.all([first.ready, second.ready]);
    let firstChanges = 0, secondChanges = 0;
    const unsubscribe = first.subscribe(() => { firstChanges++; });
    second.subscribe(() => { secondChanges++; });
    first.set({ largeText: true });
    recordOutcome(a, true, 42);
    expect(first.get()).toMatchObject({ largeText: true, wins: 1, bestVictory: 42 });
    expect(second.get()).toMatchObject({ largeText: false, wins: 0 });
    expect(firstChanges).toBe(2);
    expect(secondChanges).toBe(0);
    await settle();
    const written = JSON.parse(storage.get(`${COMMANDER_SAVE_KEY}:${COMMANDER_SLOT}`)!);
    expect(written.value.systems.preferences).toEqual(first.get());
    const reloaded = preferences(boot());
    await reloaded.ready;
    expect(reloaded.get()).toEqual(first.get());
    // The document's digest covers the record: a reloaded commander writes the same state.
    expect(reloaded.digest()).toBe(first.digest());
    unsubscribe();
    first.set({ highContrast: true });
    expect(firstChanges).toBe(2);
  });
});

test("a commander record an older build kept at its own key opens, then is written as a document", async () => {
  await withStorage(async (storage) => {
    const old = { largeText: true, highContrast: false, reducedMotion: true, wins: 7, losses: 2, bestVictory: 300 };
    storage.set(COMMANDER_KEY, JSON.stringify(old));
    const commander = preferences(boot());
    await commander.ready;
    expect(commander.get()).toEqual(old);
    commander.set({ losses: commander.get().losses + 1 });
    await settle();
    const written = JSON.parse(storage.get(`${COMMANDER_SAVE_KEY}:${COMMANDER_SLOT}`)!);
    expect(written.value.systems.preferences).toEqual({ ...old, losses: 3 });
  });
});
