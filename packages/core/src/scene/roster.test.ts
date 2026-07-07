import { describe, expect, test } from "bun:test";
import { createRoster } from "./roster";

describe("createRoster", () => {
  test("captures a wild entity into an owned entry", () => {
    const roster = createRoster({ now: () => 1000 });
    const entry = roster.capture("hero", "wild_slime");
    expect(entry.catalogId).toBe("wild_slime");
    expect(entry.capturedAt).toBe(1000);
    expect(entry.equipped).toBe(false);
    expect(roster.list("hero")).toEqual([entry]);
    expect(roster.has("hero", entry.id)).toBe(true);
  });

  test("keeps rosters scoped per owner", () => {
    const roster = createRoster();
    roster.capture("hero", "wild_slime");
    roster.capture("villain", "wild_bat");
    expect(roster.list("hero")).toHaveLength(1);
    expect(roster.list("villain")).toHaveLength(1);
  });

  test("release removes an entry", () => {
    const roster = createRoster();
    const entry = roster.capture("hero", "wild_slime");
    expect(roster.release("hero", entry.id)).toBe(true);
    expect(roster.has("hero", entry.id)).toBe(false);
    expect(roster.release("hero", entry.id)).toBe(false);
  });

  test("setEquipped toggles the equipped roster", () => {
    const roster = createRoster();
    const entry = roster.capture("hero", "wild_slime");
    expect(roster.equippedList("hero")).toEqual([]);
    const equipped = roster.setEquipped("hero", entry.id, true);
    expect(equipped?.equipped).toBe(true);
    expect(roster.equippedList("hero")).toEqual([equipped]);
    expect(roster.setEquipped("hero", "missing", true)).toBeNull();
  });

  test("persists and restores via snapshot/hydrate", () => {
    const roster = createRoster();
    roster.capture("hero", "wild_slime", { id: "roster_1", capturedAt: 5 });
    const snapshot = roster.snapshot("hero");

    const restored = createRoster();
    restored.hydrate("hero", snapshot);
    expect(restored.list("hero")).toEqual(snapshot);
  });
});
