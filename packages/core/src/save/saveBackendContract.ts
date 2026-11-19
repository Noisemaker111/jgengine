import { createSaveStore, type SaveBackend, type SaveStorage } from "./saveStore";

/**
 * How {@link saveBackendContract} drives one backend: fresh storage, a second handle on the same
 * storage (another tab, another store), and a fault injected where that backend's storage lives —
 * `localStorage` throwing a quota error, a Convex mutation rejecting, a disk write failing.
 */
export interface SaveBackendHarness {
  /** A backend over fresh, empty storage. */
  open(): SaveBackend;
  /** Another backend over the storage the last {@link open} created, the way a second tab sees it. */
  reopen(): SaveBackend;
  /** Make the storage refuse the next operation of this kind, as the real storage would. */
  failNext(operation: "read" | "write"): void;
}

/**
 * A {@link SaveBackendHarness} for a backend built over a `localStorage`-shaped {@link SaveStorage}:
 * the storage is a map that throws the way a full or locked browser storage does when told to.
 */
export function storageHarness(backendOver: (storage: SaveStorage) => SaveBackend): SaveBackendHarness {
  const faults = { read: 0, write: 0 };
  let map = new Map<string, string>();
  const refuse = (operation: "read" | "write"): void => {
    if (faults[operation] === 0) return;
    faults[operation] -= 1;
    throw new Error(operation === "write" ? "QuotaExceededError: the storage is full" : "SecurityError: the storage is locked");
  };
  const storage = (over: Map<string, string>): SaveStorage => ({
    get length() {
      return over.size;
    },
    key: (index) => [...over.keys()][index] ?? null,
    getItem(key) {
      refuse("read");
      return over.get(key) ?? null;
    },
    setItem(key, value) {
      refuse("write");
      over.set(key, value);
    },
    removeItem: (key) => void over.delete(key),
  });
  return {
    open() {
      map = new Map();
      return backendOver(storage(map));
    },
    reopen: () => backendOver(storage(map)),
    failNext: (operation) => void (faults[operation] += 1),
  };
}

/** One named check of the contract; `run` throws when the backend breaks it. */
export interface SaveBackendCheck {
  readonly name: string;
  readonly run: () => Promise<void>;
}

function expectEqual(actual: unknown, expected: unknown, what: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/**
 * The checks every {@link SaveBackend} passes, run against the save store a game uses: a refused
 * write never reads as saved, a refused read is not an empty slot, damaged bytes are kept, two stores
 * on one backend never drop each other's slot, and a slot switch never discards unsaved progress.
 * Each adopter runs them all from its own test file, so a new backend gets every guarantee at once:
 *
 * ```ts
 * for (const check of saveBackendContract(harness)) test(check.name, check.run);
 * ```
 *
 * @capability save-backend-contract the checks every save backend passes, for a backend's own test file
 */
export function saveBackendContract(harness: SaveBackendHarness): SaveBackendCheck[] {
  const store = (backend: SaveBackend, slot?: string) =>
    createSaveStore({ backend, initial: { coins: 0 }, key: "contract", slot, now: () => 1000 });
  return [
    {
      name: "keys lists what was written under a prefix and nothing removed",
      async run() {
        const backend = harness.open();
        await backend.write("contract:a", "1");
        await backend.write("contract:b", "2");
        await backend.write("other:c", "3");
        await backend.remove("contract:b");
        expectEqual((await backend.keys("contract:")).sort(), ["contract:a"], "keys");
        expectEqual(await backend.read("contract:a"), "1", "read back");
        expectEqual(await backend.read("contract:b"), null, "removed key");
      },
    },
    {
      name: "a write the storage refuses fails and keeps nothing",
      async run() {
        const save = store(harness.open());
        save.set({ coins: 5 });
        harness.failNext("write");
        const result = await save.save();
        expectEqual(result.kind, "failed", "save result");
        expectEqual(save.status(), "error", "status");
        expectEqual((await save.peek()).kind, "empty", "slot after the refused write");
        expectEqual((await save.save()).kind, "saved", "retry");
        expectEqual(await save.peek(), { kind: "loaded", value: { coins: 5 }, savedAt: 1000 }, "slot after the retry");
      },
    },
    {
      name: "a read the storage refuses is failed, never an empty slot",
      async run() {
        const backend = harness.open();
        const first = store(backend);
        first.set({ coins: 9 });
        expectEqual((await first.save()).kind, "saved", "first save");
        const second = store(harness.reopen());
        second.set({ coins: 2 });
        harness.failNext("read");
        const result = await second.load();
        expectEqual(result.kind, "failed", "load result");
        expectEqual(second.value(), { coins: 2 }, "live value after the refused read");
      },
    },
    {
      name: "damaged bytes load as corrupt and survive the next save",
      async run() {
        const backend = harness.open();
        await backend.write("contract:default", "{not a save");
        const save = store(backend);
        const result = await save.load();
        if (result.kind !== "corrupt") throw new Error(`load result: expected corrupt, got ${result.kind}`);
        expectEqual(save.value(), { coins: 0 }, "value after a damaged load");
        save.set({ coins: 1 });
        expectEqual((await save.save()).kind, "saved", "save over the damaged slot");
        expectEqual(await backend.read(result.keptAt), "{not a save", "kept bytes");
        expectEqual(await save.slots(), ["default"], "slots");
      },
    },
    {
      name: "two stores on one backend never drop each other's slot",
      async run() {
        const a = store(harness.open(), "a");
        const b = store(harness.reopen(), "b");
        a.set({ coins: 1 });
        b.set({ coins: 2 });
        const [savedA, savedB] = await Promise.all([a.save(), b.save()]);
        expectEqual([savedA.kind, savedB.kind], ["saved", "saved"], "both saves");
        expectEqual(await a.slots(), ["a", "b"], "slots seen by the first store");
        expectEqual(await b.slots(), ["a", "b"], "slots seen by the second store");
      },
    },
    {
      name: "switching slot after a failed flush stays on the old slot with its progress",
      async run() {
        const save = store(harness.open(), "a");
        save.set({ coins: 7 });
        harness.failNext("write");
        const result = await save.switchSlot("b");
        expectEqual(result.kind, "failed", "switch result");
        expectEqual(save.slot(), "a", "active slot");
        expectEqual(save.value(), { coins: 7 }, "unsaved progress");
        expectEqual((await save.switchSlot("b")).kind, "empty", "switch after the storage recovers");
        expectEqual(await save.peek("a"), { kind: "loaded", value: { coins: 7 }, savedAt: 1000 }, "slot a");
      },
    },
    {
      name: "switching to a slot that cannot be read stays on the old slot, so no save overwrites it",
      async run() {
        const backend = harness.open();
        const other = store(backend, "b");
        other.set({ coins: 4 });
        expectEqual((await other.save()).kind, "saved", "slot b saved");
        const save = store(harness.reopen(), "a");
        save.set({ coins: 1 });
        expectEqual((await save.save()).kind, "saved", "slot a saved");
        harness.failNext("read");
        expectEqual((await save.switchSlot("b")).kind, "failed", "switch result");
        expectEqual(save.slot(), "a", "active slot");
        expectEqual((await save.save()).kind, "saved", "save after the failed switch");
        expectEqual(await save.peek("b"), { kind: "loaded", value: { coins: 4 }, savedAt: 1000 }, "slot b untouched");
      },
    },
  ];
}
