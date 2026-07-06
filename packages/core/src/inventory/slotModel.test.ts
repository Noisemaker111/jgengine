import { describe, expect, test } from "bun:test";

import {
  compactSlots,
  countFilled,
  createSlots,
  firstEmpty,
  indexOfSlot,
  insertFirst,
  moveSlot,
  normalizeSlots,
  placeAt,
  removeAt,
} from "./slotModel";

describe("slot model", () => {
  test("createSlots yields a fixed null-filled grid", () => {
    expect(createSlots<string>(3)).toEqual([null, null, null]);
    expect(createSlots<string>(-2)).toEqual([]);
  });

  test("normalizeSlots trims and pads a raw id array to the target size", () => {
    expect(normalizeSlots(["a", "b", "c"], 2)).toEqual(["a", "b"]);
    expect(normalizeSlots(["a"], 3)).toEqual(["a", null, null]);
  });

  test("placeAt rejects occupied and out-of-range slots without mutating input", () => {
    const grid = createSlots<string>(2);
    const placed = placeAt(grid, 0, "sword");
    expect(placed).toEqual({ status: "ok", grid: ["sword", null] });
    expect(grid).toEqual([null, null]);
    expect(placeAt(placed.status === "ok" ? placed.grid : grid, 0, "shield")).toEqual({
      status: "rejected",
      reason: "slot-occupied",
    });
    expect(placeAt(grid, 5, "x")).toEqual({ status: "rejected", reason: "invalid-slot" });
  });

  test("removeAt clears a filled slot and rejects an empty one", () => {
    const grid = ["a", null] as (string | null)[];
    expect(removeAt(grid, 0)).toEqual({ status: "ok", grid: [null, null] });
    expect(removeAt(grid, 1)).toEqual({ status: "rejected", reason: "empty-slot" });
  });

  test("moveSlot swaps two slots and rejects moving from empty", () => {
    const grid = ["a", null, "c"] as (string | null)[];
    const moved = moveSlot(grid, 0, 1);
    expect(moved).toEqual({ status: "ok", grid: [null, "a", "c"] });
    const swapped = moveSlot(grid, 0, 2);
    expect(swapped).toEqual({ status: "ok", grid: ["c", null, "a"] });
    expect(moveSlot(grid, 1, 0)).toEqual({ status: "rejected", reason: "empty-slot" });
  });

  test("firstEmpty / insertFirst fill the earliest gap", () => {
    const grid = ["a", null, "c"] as (string | null)[];
    expect(firstEmpty(grid)).toBe(1);
    expect(insertFirst(grid, "b")).toEqual({ status: "ok", grid: ["a", "b", "c"] });
    expect(insertFirst(["a", "b"], "c")).toEqual({ status: "rejected", reason: "slot-occupied" });
  });

  test("compactSlots pushes filled slots to the front, preserving order", () => {
    expect(compactSlots([null, "a", null, "b"])).toEqual(["a", "b", null, null]);
  });

  test("countFilled and indexOfSlot inspect the grid", () => {
    const grid = ["a", null, "b"] as (string | null)[];
    expect(countFilled(grid)).toBe(2);
    expect(indexOfSlot(grid, (value) => value === "b")).toBe(2);
    expect(indexOfSlot(grid, (value) => value === "z")).toBeNull();
  });
});
