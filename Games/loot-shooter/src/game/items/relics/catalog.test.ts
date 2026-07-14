import { describe, expect, test } from "bun:test";
import { relicById, relicRegistry, rollRelicDrop } from "./catalog";

describe("relic catalog", () => {
  test("rollRelicDrop registers a rolled instance and returns its runtime id", () => {
    const id = rollRelicDrop(() => 0.5);
    expect(relicRegistry.has(id)).toBe(true);
    const relic = relicById(id);
    expect(relic).toBeDefined();
    expect(relic!.name.length).toBeGreaterThan(0);
    expect(["common", "rare", "legendary"]).toContain(relic!.rarity);
  });

  test("distinct rolls produce distinct runtime ids", () => {
    const a = rollRelicDrop(() => 0.1);
    const b = rollRelicDrop(() => 0.1);
    expect(a).not.toBe(b);
  });

  test("a low roll lands the dominant-weight common tier", () => {
    const relic = relicById(rollRelicDrop(() => 0.01))!;
    expect(relic.rarity).toBe("common");
  });

  test("a high roll can land the legendary tier", () => {
    const relic = relicById(rollRelicDrop(() => 0.99))!;
    expect(relic.rarity).toBe("legendary");
  });

  test("relicById returns undefined for a static weapon id", () => {
    expect(relicById("pistol_common")).toBeUndefined();
  });
});
