import { expect, test } from "bun:test";
import { defineGameDefinition } from "../game/defineGame";
import type { PersistConfig } from "../game/defineGame";
import { memorySaveBackend } from "../game/saveStore";
import { createGameContext } from "./gameContext";
import type { WorldSnapshot } from "./worldSnapshot";

async function withStorage(action: (values: Map<string, string>) => Promise<void>) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
  try { await action(values); }
  finally {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
}

function boot(persist: PersistConfig) {
  return createGameContext({ definition: defineGameDefinition({ name: "Declarative migration", multiplayer: "off", persist }),
    content: {}, player: { userId: "p1", isNew: true } });
}

test("declarative persistence forwards old-envelope migration before world restoration", async () => withStorage(async values => {
  const key = "jgengine:save:declarative-migration:default";
  const raw = JSON.stringify({ version: 1, savedAt: 0, value: { legacyLevel: 4 } });
  values.set(key, raw);
  let calls = 0;
  const ctx = boot({ mode: "manual", version: 2, migrate(data, fromVersion) {
    calls += 1;
    expect(fromVersion).toBe(1);
    expect(data).toEqual({ legacyLevel: 4 });
    return { store: [["progress", { level: (data as { legacyLevel: number }).legacyLevel }]] };
  } });
  try {
    expect(await ctx.game.save!.load()).toBe(true);
    expect(calls).toBe(1);
    expect(ctx.game.store.get("progress")).toEqual({ level: 4 });
    expect(values.get(key)).toBe(raw);
    await ctx.game.save!.save();
    expect(JSON.parse(values.get(key)!).version).toBe(2);
    expect(await ctx.game.save!.load()).toBe(true);
    expect(calls).toBe(1);
  } finally { ctx.game.save!.dispose(); }
}));

test("declarative rejection leaves initialized state and the stored legacy save untouched", async () => withStorage(async values => {
  const key = "jgengine:save:declarative-migration:default";
  const raw = JSON.stringify({ version: 1, savedAt: 0, value: { store: [["progress", { level: 99 }]] } });
  values.set(key, raw);
  const ctx = boot({ mode: "manual", version: 2, migrate() { throw new Error("Missing legacy session state"); } });
  ctx.game.store.set("progress", { level: 1 });
  try {
    expect(await ctx.game.save!.load()).toBe(false);
    expect(ctx.game.save!.status()).toBe("idle");
    expect(ctx.game.store.get("progress")).toEqual({ level: 1 });
    expect(values.get(key)).toBe(raw);
  } finally { ctx.game.save!.dispose(); }
}));

test("omitting migration preserves the compatible version-mismatch behavior", async () => withStorage(async values => {
  const snapshot: WorldSnapshot = { store: [["progress", { level: 8 }]] };
  values.set("jgengine:save:declarative-migration:default", JSON.stringify({ version: 1, savedAt: 0, value: snapshot }));
  const ctx = boot({ mode: "manual", version: 2 });
  try {
    expect(await ctx.game.save!.load()).toBe(true);
    expect(ctx.game.store.get("progress")).toEqual({ level: 8 });
  } finally { ctx.game.save!.dispose(); }
}));

test("raw declarative payloads migrate from version zero", async () => withStorage(async values => {
  values.set("jgengine:save:declarative-migration:default", JSON.stringify({ legacyLevel: 6 }));
  const ctx = boot({ mode: "manual", version: 2, migrate(data, fromVersion) {
    expect(fromVersion).toBe(0);
    return { store: [["progress", { level: (data as { legacyLevel: number }).legacyLevel }]] };
  } });
  try {
    expect(await ctx.game.save!.load()).toBe(true);
    expect(ctx.game.store.get("progress")).toEqual({ level: 6 });
  } finally { ctx.game.save!.dispose(); }
}));

test("explicit save options override declarative migration", async () => {
  const backend = memorySaveBackend();
  await backend.write("override:default", JSON.stringify({ version: 1, savedAt: 0, value: {} }));
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "Declarative migration", multiplayer: "off",
      persist: { mode: "manual", version: 2, migrate() { throw new Error("Declarative hook must be overridden"); } } }),
    content: {}, player: { userId: "p1", isNew: true },
    save: { backend, key: "override", mode: "manual", version: 3,
      migrate: () => ({ store: [["progress", { level: 12 }]] }) },
  });
  try {
    expect(await ctx.game.save!.load()).toBe(true);
    expect(ctx.game.store.get("progress")).toEqual({ level: 12 });
  } finally { ctx.game.save!.dispose(); }
});
