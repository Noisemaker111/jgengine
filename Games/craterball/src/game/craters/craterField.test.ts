import { describe, expect, test } from "bun:test";
import { flatField } from "@jgengine/core/world/terrain";
import { CRATER_CAP, addCraterRecord, buildCarvedField, createCraterFieldState } from "./craterField";

describe("craterball crater field", () => {
  test("starts empty", () => {
    const state = createCraterFieldState();
    expect(state.records).toHaveLength(0);
    expect(state.totalCreated).toBe(0);
  });

  test("adding a crater grows the visible record list and the lifetime counter", () => {
    const state = addCraterRecord(createCraterFieldState(), 1, 2, 10);
    expect(state.records).toHaveLength(1);
    expect(state.totalCreated).toBe(1);
    expect(state.records[0]!.x).toBe(1);
    expect(state.records[0]!.z).toBe(2);
  });

  test("beyond the cap, the oldest crater fades from the visible list but the lifetime count keeps growing", () => {
    let state = createCraterFieldState();
    for (let i = 0; i < CRATER_CAP + 5; i += 1) {
      state = addCraterRecord(state, i, 0, i);
    }
    expect(state.records).toHaveLength(CRATER_CAP);
    expect(state.totalCreated).toBe(CRATER_CAP + 5);
    expect(state.records[0]!.x).toBe(5);
    expect(state.records[state.records.length - 1]!.x).toBe(CRATER_CAP + 4);
  });

  test("buildCarvedField deforms the base field into a bowl at the crater center", () => {
    const state = addCraterRecord(createCraterFieldState(), 0, 0, 0, 3, 1);
    const field = buildCarvedField(flatField(), state.records);
    expect(field.sampleHeight(0, 0)).toBeLessThan(0);
    expect(field.sampleHeight(50, 50)).toBe(0);
  });
});
