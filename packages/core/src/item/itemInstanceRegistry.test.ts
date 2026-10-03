import { describe, expect, test } from "bun:test";

import {
  createItemInstanceRegistry,
  proceduralLootEntry,
  type ItemInstanceStorage,
} from "@jgengine/core/item/itemInstanceRegistry";

function externalStorage<TDef>(initial: [string, TDef][] = []): ItemInstanceStorage<TDef> {
  let data = new Map(initial);
  return {
    get: (id) => data.get(id),
    has: (id) => data.has(id),
    set: (id, def) => void data.set(id, def),
    delete: (id) => void data.delete(id),
    count: () => data.size,
    entries: () => data.entries(),
    replace(entries) { data = new Map(entries); },
  };
}

describe("createItemInstanceRegistry", () => {
  test("register returns a unique id per call, distinct from the base id", () => {
    const registry = createItemInstanceRegistry<{ name: string }>("gen");
    const a = registry.register("pistol_rare", { name: "Vector Pistol" });
    const b = registry.register("pistol_rare", { name: "Another Vector Pistol" });
    expect(a).not.toBe(b);
    expect(a).not.toBe("pistol_rare");
    expect(a.startsWith("gen:pistol_rare:")).toBe(true);
  });

  test("get/has resolve a registered instance", () => {
    const registry = createItemInstanceRegistry<{ name: string }>();
    const id = registry.register("relic_charm", { name: "Keen Charm" });
    expect(registry.has(id)).toBe(true);
    expect(registry.get(id)).toEqual({ name: "Keen Charm" });
    expect(registry.has("unknown")).toBe(false);
    expect(registry.get("unknown")).toBeUndefined();
  });

  test("release removes the instance", () => {
    const registry = createItemInstanceRegistry<{ name: string }>();
    const id = registry.register("relic_charm", { name: "Keen Charm" });
    expect(registry.count()).toBe(1);
    registry.release(id);
    expect(registry.has(id)).toBe(false);
    expect(registry.count()).toBe(0);
  });

  test("defaults to an \"item\" prefix", () => {
    const registry = createItemInstanceRegistry<{ name: string }>();
    const id = registry.register("base", { name: "x" });
    expect(id.startsWith("item:base:")).toBe(true);
  });

  test("JSON restore keeps rolled definitions, ids, and the sequence after releases", () => {
    const original = createItemInstanceRegistry<{ stats: { damage: number } }>("loot");
    const kept = original.register("gun", { stats: { damage: 17 } });
    const released = original.register("gun", { stats: { damage: 25 } });
    original.release(released);
    const saved = original.state();
    const decoded = JSON.parse(JSON.stringify(saved));
    const resumed = createItemInstanceRegistry<{ stats: { damage: number } }>("loot");
    const stale = resumed.register("relic", { stats: { damage: 0 } });
    expect(resumed.restore(decoded)).toBe(true);
    expect(resumed.has(stale)).toBe(false);
    expect(resumed.get(kept)).toEqual({ stats: { damage: 17 } });
    expect(resumed.has(released)).toBe(false);
    expect(resumed.state()).toEqual(original.state());
    saved.entries[0][1].stats.damage = 999;
    decoded.entries[0][1].stats.damage = 888;
    expect(original.get(kept)?.stats.damage).toBe(17);
    expect(resumed.get(kept)?.stats.damage).toBe(17);
    expect(resumed.register("gun", { stats: { damage: 30 } })).toBe("loot:gun:3");
  });

  test("an empty registry retains its allocator and rejects a different prefix", () => {
    const registry = createItemInstanceRegistry<number>("loot");
    registry.release(registry.register("gun", 10));
    const saved = registry.state();
    const resumed = createItemInstanceRegistry<number>("loot");
    expect(resumed.restore(JSON.parse(JSON.stringify(saved)))).toBe(true);
    expect(resumed.register("gun", 20)).toBe("loot:gun:2");
    const before = resumed.state();
    expect(resumed.restore({ ...saved, prefix: "other" })).toBe(false);
    expect(resumed.state()).toEqual(before);
  });

  test("injected storage is authoritative and attaching it never overwrites existing ids", () => {
    const storage = externalStorage([["loot:gun:1", 10], ["custom opaque id", 50]]);
    const registry = createItemInstanceRegistry("loot", { storage });
    expect(registry.register("gun", 20)).toBe("loot:gun:2");
    expect(storage.get("loot:gun:1")).toBe(10);
    expect(storage.get("loot:gun:2")).toBe(20);
    storage.set("external", 30);
    expect(registry.get("external")).toBe(30);
    registry.release("loot:gun:2");
    const resumed = createItemInstanceRegistry("loot", { storage, sequence: registry.state().sequence });
    expect(resumed.register("gun", 40)).toBe("loot:gun:3");
    expect(resumed.get("custom opaque id")).toBe(50);
    expect(resumed.restore({ prefix: "loot", sequence: 5, entries: [["other:custom:999", 70]] })).toBe(true);
    expect(resumed.get("other:custom:999")).toBe(70);
    expect(resumed.register("gun", 80)).toBe("loot:gun:6");
  });

  test("pages detach definitions, preserve ordering, and restore the allocation sequence", () => {
    const registry = createItemInstanceRegistry<{ roll: number }>("loot");
    for (let i = 0; i < 5; i++) registry.register("gun", { roll: i });
    registry.release(registry.register("gun", { roll: 99 }));
    const pages = Array.from(registry.statePages(2));
    expect(pages.map((page) => page.entries.length)).toEqual([2, 2, 1]);
    expect(pages.every((page) => page.sequence === 6)).toBe(true);
    expect(pages.flatMap((page) => page.entries)).toEqual(registry.state().entries);
    const resumed = createItemInstanceRegistry<{ roll: number }>("loot", { storage: externalStorage() });
    expect(resumed.restorePages(JSON.parse(JSON.stringify(pages)))).toBe(true);
    expect(resumed.state()).toEqual(registry.state());
    pages[0]!.entries[0]![1].roll = -1;
    expect(registry.get("loot:gun:1")?.roll).toBe(0);
    expect(resumed.get("loot:gun:1")?.roll).toBe(0);
    expect(resumed.register("gun", { roll: 6 })).toBe("loot:gun:7");
  });

  test("empty page exports retain allocator state and close storage iterators", () => {
    let closed = 0;
    const storage = externalStorage<number>();
    storage.entries = function* () { try { yield ["loot:gun:1", 10]; } finally { closed++; } };
    const registry = createItemInstanceRegistry("loot", { storage });
    const exportPages = registry.statePages(1);
    exportPages.next();
    exportPages.return?.();
    expect(closed).toBe(1);
    const empty = createItemInstanceRegistry<number>("loot");
    empty.release(empty.register("gun", 10));
    expect(Array.from(empty.statePages(2))).toEqual([empty.state()]);
    expect(registry.restorePages(empty.statePages(2))).toBe(true);
    expect(registry.register("gun", 20)).toBe("loot:gun:2");
  });

  test("paged export detects mutations without locking abandoned exports", () => {
    const registry = createItemInstanceRegistry<number>();
    registry.register("gun", 1);
    registry.register("gun", 2);
    const pages = registry.statePages(1);
    expect(pages.next().value?.entries.length).toBe(1);
    registry.register("gun", 3);
    expect(() => pages.next()).toThrow("changed during export");
    const notStarted = registry.statePages(1);
    registry.release("item:gun:1");
    expect(() => notStarted.next()).toThrow("changed during export");
    registry.statePages(1);
    expect(registry.register("gun", 4)).toBe("item:gun:4");
  });

  test("failed page validation, cloning, and atomic replacement preserve storage and allocator", () => {
    const storage = externalStorage<number>();
    const registry = createItemInstanceRegistry("loot", { storage });
    registry.register("gun", 10);
    const before = registry.state();
    expect(registry.restorePages([])).toBe(false);
    expect(registry.restorePages([{ prefix: "wrong", sequence: 20, entries: [] }])).toBe(false);
    expect(() => registry.restorePages([
      { prefix: "loot", sequence: 20, entries: [["opaque", 2]] },
      { prefix: "loot", sequence: 21, entries: [] },
    ])).toThrow("Inconsistent");
    expect(registry.state()).toEqual(before);
    const rejecting = createItemInstanceRegistry<number | (() => void)>("loot");
    rejecting.register("gun", 10);
    expect(() => rejecting.restorePages([
      { prefix: "loot", sequence: 20, entries: [["opaque", 2]] },
      { prefix: "loot", sequence: 20, entries: [["bad", () => {}]] },
    ])).toThrow();
    expect(rejecting.state()).toEqual(before);
    let closed = 0;
    const interrupted = {
      [Symbol.iterator]() {
        let first = true;
        return {
          next() {
            if (!first) throw new Error("Page stream failed");
            first = false;
            return { done: false as const, value: { prefix: "loot", sequence: 20, entries: [["opaque", 2] as [string, number]] } };
          },
          return() { closed++; return { done: true as const, value: undefined }; },
        };
      },
    };
    expect(() => registry.restorePages(interrupted)).toThrow("stream failed");
    expect(closed).toBe(1);
    expect(registry.state()).toEqual(before);
    const failingClose = {
      [Symbol.iterator]() {
        const pages = [{ prefix: "loot", sequence: 20, entries: [] }][Symbol.iterator]();
        return { next: () => pages.next(), return() { throw new Error("Page close failed"); } };
      },
    };
    expect(() => registry.restorePages(failingClose)).toThrow("close failed");
    expect(registry.state()).toEqual(before);
    storage.replace = (entries) => {
      Array.from(entries);
      throw new Error("Storage transaction failed");
    };
    expect(() => registry.restorePages([{ prefix: "loot", sequence: 20, entries: [] }])).toThrow("transaction failed");
    expect(registry.state()).toEqual(before);
    expect(registry.register("gun", 30)).toBe("loot:gun:2");
  });

  test("allocator and page sizes reject unsafe values and allocator exhaustion cannot reuse ids", () => {
    for (const invalid of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => createItemInstanceRegistry("loot", { sequence: invalid })).toThrow(RangeError);
      const registry = createItemInstanceRegistry<number>("loot");
      expect(registry.restore({ prefix: "loot", sequence: invalid, entries: [] })).toBe(false);
    }
    const registry = createItemInstanceRegistry<number>("loot", { sequence: Number.MAX_SAFE_INTEGER - 1 });
    expect(registry.register("gun", 1)).toBe(`loot:gun:${Number.MAX_SAFE_INTEGER}`);
    expect(() => registry.register("gun", 2)).toThrow("exhausted");
    expect(registry.count()).toBe(1);
    for (const invalid of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => registry.statePages(invalid)).toThrow(RangeError);
    }
  });

  test("a million logical identities export and clone only the requested page", () => {
    const total = 1_000_000;
    let visited = 0;
    let cloned = 0;
    let probes = 0;
    const writes = new Map<string, { roll: number }>();
    const storage: ItemInstanceStorage<{ roll: number }> = {
      get(id) {
        const ordinal = Number(id.slice("loot:gun:".length));
        if (writes.has(id)) return writes.get(id);
        return id.startsWith("loot:gun:") && ordinal >= 1 && ordinal <= total
          ? { roll: ordinal - 1 } : undefined;
      },
      has(id) { probes++; return this.get(id) !== undefined; },
      set: (id, def) => void writes.set(id, def),
      delete: (id) => void writes.delete(id),
      count: () => total + writes.size,
      *entries() {
        for (let i = 1; i <= total; i++) {
          visited++;
          const roll = i - 1;
          yield [`loot:gun:${i}`, { get roll() { cloned++; return roll; } }];
        }
        yield* writes;
      },
      replace() { throw new Error("Logical fixture is read-only for replacement"); },
    };
    const registry = createItemInstanceRegistry("loot", { storage, sequence: total });
    expect(registry.count()).toBe(total);
    expect(registry.get("loot:gun:1000000")).toEqual({ roll: total - 1 });
    expect(visited).toBe(0);
    const pages = registry.statePages(128);
    const first = pages.next().value!;
    const second = pages.next().value!;
    expect(visited).toBe(256);
    expect(cloned).toBe(256);
    expect(first.entries[0]).toEqual(["loot:gun:1", { roll: 0 }]);
    expect(second.entries[127]).toEqual(["loot:gun:256", { roll: 255 }]);
    pages.return?.();
    const resumed = createItemInstanceRegistry<{ roll: number }>("loot");
    expect(resumed.restorePages([first, second])).toBe(true);
    expect(resumed.register("gun", { roll: total })).toBe("loot:gun:1000001");
    expect(registry.register("gun", { roll: total })).toBe("loot:gun:1000001");
    expect(probes).toBe(1);
    expect(visited).toBe(256);
    expect(cloned).toBe(256);
  });
});

describe("proceduralLootEntry", () => {
  test("rolls once, registers the result, and returns the runtime id", () => {
    const registry = createItemInstanceRegistry<{ rarity: string }>("relic");
    const calls: number[] = [];
    const generate = proceduralLootEntry(registry, (rng) => {
      const roll = rng();
      calls.push(roll);
      return { baseId: "charm", def: { rarity: roll < 0.5 ? "common" : "rare" } };
    });
    const id = generate(() => 0.9);
    expect(calls).toEqual([0.9]);
    expect(registry.get(id)).toEqual({ rarity: "rare" });
    expect(id.startsWith("relic:charm:")).toBe(true);
  });

  test("each call produces a distinct instance", () => {
    const registry = createItemInstanceRegistry<{ n: number }>("gen");
    let n = 0;
    const generate = proceduralLootEntry(registry, () => ({ baseId: "thing", def: { n: n++ } }));
    const a = generate(() => 0);
    const b = generate(() => 0);
    expect(a).not.toBe(b);
    expect(registry.get(a)).toEqual({ n: 0 });
    expect(registry.get(b)).toEqual({ n: 1 });
  });
});
