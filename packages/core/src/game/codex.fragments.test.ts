import { describe, expect, test } from "bun:test";

import { createCodex } from "./codex";

function blueprints() {
  const learned: string[] = [];
  const codex = createCodex({
    entries: [
      { id: "cutter", name: "Cutter", category: "Blueprints", fragments: 3 },
      { id: "lamp", name: "Lamp", category: "Blueprints" },
    ],
    now: () => 7,
    onDiscover: (entry) => learned.push(entry.id),
  });
  return { codex, learned };
}

describe("codex fragments", () => {
  test("an entry is learned on its last fragment, not before", () => {
    const { codex, learned } = blueprints();
    expect(codex.get("cutter")).toMatchObject({ scanned: 0, fragments: 3, discovered: false });
    expect(codex.scan("cutter")).toMatchObject({ scanned: 1, discovered: false });
    expect(codex.scan("cutter")).toMatchObject({ scanned: 2, discovered: false });
    expect(learned).toEqual([]);
    expect(codex.scan("cutter")).toMatchObject({ scanned: 3, fragments: 3, discovered: true, discoveredAt: 7 });
    expect(learned).toEqual(["cutter"]);
    expect(codex.scan("cutter")).toBeNull();
  });

  test("an entry without fragments is learned on its first scan", () => {
    const { codex } = blueprints();
    expect(codex.scan("lamp")).toMatchObject({ scanned: 1, fragments: 1, discovered: true });
    expect(codex.scan("ghost")).toBeNull();
  });

  test("a multi-fragment scan can finish an entry at once", () => {
    const { codex } = blueprints();
    expect(codex.scan("cutter", 5)?.discovered).toBe(true);
    expect(() => codex.scan("lamp", -1)).toThrow("non-negative");
  });

  test("partial progress survives snapshot and restore, and old saves still load", () => {
    const { codex } = blueprints();
    codex.scan("cutter", 2);
    const saved = JSON.parse(JSON.stringify(codex.snapshot()));
    expect(saved.progress).toEqual({ cutter: 2 });
    const { codex: loaded } = blueprints();
    loaded.restore(saved);
    expect(loaded.get("cutter")).toMatchObject({ scanned: 2, discovered: false });
    expect(loaded.scan("cutter")?.discovered).toBe(true);
    loaded.restore({ discovered: {}, progress: { cutter: 99 } });
    expect(loaded.get("cutter")).toMatchObject({ scanned: 2, discovered: false });
    loaded.restore({ discovered: { lamp: 3 } });
    expect(loaded.get("cutter")?.scanned).toBe(0);
    expect(loaded.isDiscovered("lamp")).toBe(true);
  });
});
