import { describe, expect, test } from "bun:test";

import { isCovered, isFree, isFullySupported, sideOpen, slotIdAt, SLOT_COUNT, TURTLE } from "./layout";

describe("turtle layout integrity", () => {
  test("has 144 slots across five layers", () => {
    expect(SLOT_COUNT).toBe(144);
    const perLayer: Record<number, number> = {};
    for (const s of TURTLE) perLayer[s.z] = (perLayer[s.z] ?? 0) + 1;
    expect(perLayer).toEqual({ 0: 87, 1: 36, 2: 16, 3: 4, 4: 1 });
  });

  test("no two tiles overlap within a layer", () => {
    let overlaps = 0;
    for (let i = 0; i < TURTLE.length; i += 1) {
      for (let j = i + 1; j < TURTLE.length; j += 1) {
        const a = TURTLE[i];
        const b = TURTLE[j];
        if (a.z === b.z && Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2) overlaps += 1;
      }
    }
    expect(overlaps).toBe(0);
  });

  test("every upper-layer tile rests on a fully supported footprint", () => {
    for (const s of TURTLE) expect(isFullySupported(s.id)).toBe(true);
  });

  test("slots carry unique ids and stable coordinates", () => {
    const ids = new Set(TURTLE.map((s) => s.id));
    expect(ids.size).toBe(144);
    expect(slotIdAt(13, 7, 4)).not.toBeNull();
  });
});

describe("free-tile rule", () => {
  const full = new Set<number>(TURTLE.map((s) => s.id));

  test("the crown is free but tiles it covers are not (top blocking)", () => {
    const crown = slotIdAt(13, 7, 4);
    const underCrown = slotIdAt(12, 6, 3);
    expect(crown).not.toBeNull();
    expect(underCrown).not.toBeNull();
    expect(isFree(crown as number, full)).toBe(true);
    expect(isCovered(underCrown as number, full)).toBe(true);
    expect(isFree(underCrown as number, full)).toBe(false);
  });

  test("removing the covering tile frees the tile below", () => {
    const crown = slotIdAt(13, 7, 4) as number;
    const layer3 = [slotIdAt(12, 6, 3), slotIdAt(14, 6, 3), slotIdAt(12, 8, 3), slotIdAt(14, 8, 3)];
    const withoutCrown = new Set(full);
    withoutCrown.delete(crown);
    const anyFree = layer3.some((id) => id !== null && isFree(id as number, withoutCrown));
    expect(anyFree).toBe(true);
  });

  test("row ends are free, interior tiles are side-blocked", () => {
    // isolate the bottom row (y=0) so only side adjacency is in play
    const row = TURTLE.filter((s) => s.z === 0 && s.y === 0).map((s) => s.id);
    const present = new Set(row);
    const leftEnd = slotIdAt(2, 0, 0) as number;
    const rightEnd = slotIdAt(24, 0, 0) as number;
    const interior = slotIdAt(12, 0, 0) as number;
    expect(isFree(leftEnd, present)).toBe(true);
    expect(isFree(rightEnd, present)).toBe(true);
    expect(isFree(interior, present)).toBe(false);
    expect(sideOpen(interior, present, "left")).toBe(false);
    expect(sideOpen(interior, present, "right")).toBe(false);
    expect(sideOpen(leftEnd, present, "left")).toBe(true);
  });

  test("the tail tile is free from the opening position", () => {
    const tail = slotIdAt(0, 7, 0) as number;
    expect(isFree(tail, full)).toBe(true);
  });
});
