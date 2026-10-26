import { describe, expect, test } from "bun:test";

import { createSaveSlots } from "./saveSlots";

/** A save-slots index driven by a mutable clock so `savedAt` is deterministic. */
function clocked(config: Parameters<typeof createSaveSlots>[0] = {}) {
  let t = 1000;
  const slots = createSaveSlots({ ...config, now: () => t });
  return {
    slots,
    at(next: number) {
      t = next;
    },
  };
}

describe("createSaveSlots", () => {
  test("capacity pads with empty slots in order", () => {
    const slots = createSaveSlots({ capacity: 3 });
    const list = slots.list();
    expect(list.map((s) => s.id)).toEqual(["slot-1", "slot-2", "slot-3"]);
    expect(list.every((s) => s.empty)).toBe(true);
    expect(list.every((s) => Object.keys(s.meta).length === 0)).toBe(true);
  });

  test("seeded slots normalize and pad up to capacity without id collisions", () => {
    const slots = createSaveSlots({
      capacity: 3,
      slots: [{ id: "slot-1", empty: false, savedAt: 5, name: "Ada", meta: { level: 8 } }],
    });
    const ids = slots.list().map((s) => s.id);
    expect(ids).toEqual(["slot-1", "slot-2", "slot-3"]);
    expect(slots.get("slot-1")?.name).toBe("Ada");
    expect(slots.get("slot-2")?.empty).toBe(true);
  });

  test("write stamps savedAt from the clock and marks non-empty", () => {
    const { slots, at } = clocked({ capacity: 2 });
    at(4200);
    const written = slots.write("slot-1", { name: "Hero", meta: { chapter: "Keep", level: 8 } });
    expect(written.empty).toBe(false);
    expect(written.savedAt).toBe(4200);
    expect(written.name).toBe("Hero");
    expect(written.meta).toEqual({ chapter: "Keep", level: 8 });
  });

  test("write creates an open-ended slot when no capacity is set", () => {
    const slots = createSaveSlots();
    expect(slots.list()).toHaveLength(0);
    slots.write("profile-a", { name: "A" });
    expect(slots.list().map((s) => s.id)).toEqual(["profile-a"]);
  });

  test("write past a fixed capacity throws", () => {
    const slots = createSaveSlots({ capacity: 1 });
    slots.write("slot-1");
    expect(() => slots.write("slot-2")).toThrow(/capacity/);
  });

  test("write keeps existing name/meta when omitted", () => {
    const slots = createSaveSlots({ capacity: 1 });
    slots.write("slot-1", { name: "Hero", meta: { level: 3 } });
    slots.write("slot-1");
    expect(slots.get("slot-1")?.name).toBe("Hero");
    expect(slots.get("slot-1")?.meta).toEqual({ level: 3 });
  });

  test("clear empties a slot and drops name/savedAt/meta", () => {
    const slots = createSaveSlots({ capacity: 2 });
    slots.write("slot-1", { name: "Hero", meta: { level: 9 } });
    const cleared = slots.clear("slot-1");
    expect(cleared?.empty).toBe(true);
    expect(cleared?.name).toBeUndefined();
    expect(cleared?.savedAt).toBeUndefined();
    expect(cleared?.meta).toEqual({});
    expect(slots.clear("missing")).toBeNull();
  });

  test("rename updates the label without touching savedAt/meta", () => {
    const { slots, at } = clocked({ capacity: 1 });
    at(500);
    slots.write("slot-1", { name: "Old", meta: { level: 2 } });
    const renamed = slots.rename("slot-1", "New");
    expect(renamed?.name).toBe("New");
    expect(renamed?.savedAt).toBe(500);
    expect(renamed?.meta).toEqual({ level: 2 });
    expect(slots.rename("missing", "x")).toBeNull();
  });

  test("mostRecent returns the newest non-empty slot, or null when all empty", () => {
    const { slots, at } = clocked({ capacity: 3 });
    expect(slots.mostRecent()).toBeNull();
    at(100);
    slots.write("slot-1", { name: "First" });
    at(300);
    slots.write("slot-2", { name: "Latest" });
    at(200);
    slots.write("slot-3", { name: "Middle" });
    expect(slots.mostRecent()?.id).toBe("slot-2");
    slots.clear("slot-2");
    expect(slots.mostRecent()?.id).toBe("slot-3");
  });

  test("get/list return defensive copies", () => {
    const slots = createSaveSlots({ capacity: 1 });
    slots.write("slot-1", { meta: { level: 1 } });
    const got = slots.get("slot-1")!;
    got.meta.level = 999;
    got.name = "mutated";
    expect(slots.get("slot-1")?.meta.level).toBe(1);
    expect(slots.get("slot-1")?.name).toBeUndefined();
  });

  test("subscribe fires on write/clear/rename and unsubscribe stops it", () => {
    const slots = createSaveSlots({ capacity: 2 });
    let count = 0;
    const unsub = slots.subscribe(() => {
      count += 1;
    });
    slots.write("slot-1", { name: "A" });
    slots.rename("slot-1", "B");
    slots.clear("slot-1");
    expect(count).toBe(3);
    unsub();
    slots.write("slot-2");
    expect(count).toBe(3);
  });

  test("snapshot/restore round-trips slots and capacity", () => {
    const { slots, at } = clocked({ capacity: 2 });
    at(700);
    slots.write("slot-1", { name: "Hero", meta: { chapter: "Keep", level: 8 } });
    const snap = slots.snapshot();
    const restored = createSaveSlots();
    restored.restore(snap);
    expect(restored.list()).toEqual(slots.list());
    expect(restored.snapshot().capacity).toBe(2);
    expect(restored.mostRecent()?.id).toBe("slot-1");
    // Restore must not alias the snapshot's arrays.
    snap.slots[0]!.name = "tampered";
    expect(restored.get("slot-1")?.name).toBe("Hero");
  });
});
