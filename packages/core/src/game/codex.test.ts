import { describe, expect, test } from "bun:test";

import { createCodex, type CodexEntryDef } from "./codex";

const ENTRIES: readonly CodexEntryDef[] = [
  { id: "wolf", name: "Gray Wolf", category: "Beasts", description: "A pack hunter." },
  { id: "wisp", name: "Marsh Wisp", category: "Spirits", secret: true },
  { id: "golem", name: "Stone Golem", category: "Beasts" },
];

function codex(onDiscover?: (v: unknown) => void) {
  let clock = 1000;
  return createCodex({ entries: ENTRIES, now: () => (clock += 1), onDiscover: onDiscover as never });
}

describe("createCodex", () => {
  test("discover marks an entry once and fires onDiscover", () => {
    const seen: string[] = [];
    const c = codex((v) => seen.push((v as { id: string }).id));
    const first = c.discover("wolf");
    expect(first?.discovered).toBe(true);
    expect(c.isDiscovered("wolf")).toBe(true);
    expect(c.discover("wolf")).toBeNull(); // already discovered
    expect(c.discover("nope")).toBeNull(); // unknown
    expect(seen).toEqual(["wolf"]);
  });

  test("completion and counts", () => {
    const c = codex();
    expect(c.total()).toBe(3);
    expect(c.completion()).toBe(0);
    c.discover("wolf");
    c.discover("golem");
    expect(c.discoveredCount()).toBe(2);
    expect(c.completion()).toBeCloseTo(2 / 3, 5);
  });

  test("categories and category-filtered list", () => {
    const c = codex();
    expect(c.categories()).toEqual(["Beasts", "Spirits"]);
    expect(c.list("Beasts").map((v) => v.id)).toEqual(["wolf", "golem"]);
  });

  test("list keeps a stable identity until a change", () => {
    const c = codex();
    const a = c.list();
    expect(c.list()).toBe(a);
    c.discover("wolf");
    expect(c.list()).not.toBe(a);
  });

  test("snapshot/restore round-trips discovery; unknown ids dropped", () => {
    const c = codex();
    c.discover("wolf");
    const snap = JSON.parse(JSON.stringify(c.snapshot()));

    const c2 = codex();
    c2.restore(snap);
    expect(c2.isDiscovered("wolf")).toBe(true);
    expect(c2.completion()).toBeCloseTo(1 / 3, 5);

    c2.restore({ discovered: { ghost: 5 } });
    expect(c2.discoveredCount()).toBe(0);
  });

  test("subscribe fires on discover/restore and stops after unsubscribe", () => {
    const c = codex();
    let hits = 0;
    const off = c.subscribe(() => { hits += 1; });
    c.discover("wolf");
    c.restore({ discovered: {} });
    off();
    c.discover("golem");
    expect(hits).toBe(2);
  });
});
