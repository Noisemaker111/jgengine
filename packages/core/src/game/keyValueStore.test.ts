import { describe, expect, test } from "bun:test";
import { createKeyValueStore, type KeyValueStorage, type KeyValueStorageFailure } from "./keyValueStore";

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

function throwingStorage(): KeyValueStorage {
  return {
    getItem: () => {
      throw new Error("read blocked");
    },
    setItem: () => {
      throw new Error("write blocked");
    },
    removeItem: () => {
      throw new Error("remove blocked");
    },
  };
}

describe("createKeyValueStore", () => {
  test("returns the initial value when storage is empty", () => {
    const bank = createKeyValueStore({ key: "credits", initial: 100, storage: memoryStorage() });
    expect(bank.get()).toBe(100);
  });

  test("hydrates from a previously stored value", () => {
    const storage = memoryStorage({ credits: "250" });
    const bank = createKeyValueStore({ key: "credits", initial: 100, storage });
    expect(bank.get()).toBe(250);
  });

  test("set persists the value", () => {
    const storage = memoryStorage();
    const bank = createKeyValueStore({ key: "credits", initial: 0, storage });
    bank.set(42);
    expect(bank.get()).toBe(42);
    expect(storage.data.credits).toBe("42");
  });

  test("update mutates read-modify-write and returns the next value", () => {
    const storage = memoryStorage({ credits: "10" });
    const bank = createKeyValueStore({ key: "credits", initial: 0, storage });
    const next = bank.update((c) => c + 5);
    expect(next).toBe(15);
    expect(bank.get()).toBe(15);
    expect(storage.data.credits).toBe("15");
  });

  test("clear resets to initial and removes the stored payload", () => {
    const storage = memoryStorage({ credits: "999" });
    const bank = createKeyValueStore({ key: "credits", initial: 100, storage });
    bank.clear();
    expect(bank.get()).toBe(100);
    expect("credits" in storage.data).toBe(false);
  });

  test("round-trips a structured value", () => {
    const storage = memoryStorage();
    const store = createKeyValueStore({ key: "save", initial: { level: 1, unlocked: [] as string[] }, storage });
    store.set({ level: 3, unlocked: ["a", "b"] });
    const reopened = createKeyValueStore({ key: "save", initial: { level: 1, unlocked: [] as string[] }, storage });
    expect(reopened.get()).toEqual({ level: 3, unlocked: ["a", "b"] });
  });

  test("corrupt stored JSON degrades to the initial value", () => {
    const storage = memoryStorage({ credits: "not-json{" });
    const bank = createKeyValueStore({ key: "credits", initial: 100, storage });
    expect(bank.get()).toBe(100);
  });

  test("throwing storage never propagates and keeps the value in memory", () => {
    const bank = createKeyValueStore({ key: "credits", initial: 0, storage: throwingStorage() });
    expect(() => bank.set(7)).not.toThrow();
    expect(bank.get()).toBe(7);
    expect(() => bank.clear()).not.toThrow();
    expect(bank.get()).toBe(0);
  });

  test("null storage is memory-only", () => {
    const bank = createKeyValueStore({ key: "credits", initial: 5, storage: null });
    bank.update((c) => c + 1);
    expect(bank.get()).toBe(6);
  });

  test("fallback observes denied reads, writes and removals while retaining session state", () => {
    const failures: KeyValueStorageFailure[] = [];
    const bank = createKeyValueStore({ key: "credits", initial: 0, storage: throwingStorage(), onError: (failure) => failures.push(failure) });
    bank.set(7);
    expect(bank.get()).toBe(7);
    bank.clear();
    expect(bank.get()).toBe(0);
    expect(failures.map(({ operation, key }) => [operation, key])).toEqual([["read", "credits"], ["write", "credits"], ["remove", "credits"]]);
    expect(failures.map(({ error }) => (error as Error).message)).toEqual(["read blocked", "write blocked", "remove blocked"]);
  });

  test("strict denied read exposes the original error", () => {
    const error = new Error("read denied");
    expect(() => createKeyValueStore({ key: "credits", initial: 0, storage: { ...memoryStorage(), getItem() { throw error; } }, errorMode: "throw" })).toThrow(error);
  });

  test("strict failed writes, updates and removals preserve the previous cell and checkpoint", () => {
    const storage = memoryStorage({ credits: "10" });
    const error = new Error("quota exceeded");
    storage.setItem = () => { throw error; };
    storage.removeItem = () => { throw error; };
    const bank = createKeyValueStore({ key: "credits", initial: 0, storage, errorMode: "throw" });
    expect(() => bank.set(20)).toThrow(error);
    expect(() => bank.update((value) => value + 1)).toThrow(error);
    expect(() => bank.clear()).toThrow(error);
    expect(bank.get()).toBe(10);
    expect(storage.data.credits).toBe("10");
  });

  test("strict explicit null storage deliberately keeps a memory cell", () => {
    const bank = createKeyValueStore({ key: "credits", initial: 5, storage: null, errorMode: "throw" });
    bank.set(9);
    expect(bank.get()).toBe(9);
  });
});
