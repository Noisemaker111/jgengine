import { describe, expect, it } from "bun:test";
import { createFogField } from "./fog";

const BOUNDS = { minX: -10, minZ: -10, maxX: 10, maxZ: 10 };

describe("fog of war", () => {
  it("starts fully fogged", () => {
    const fog = createFogField({ bounds: BOUNDS, cellSize: 2 });
    expect(fog.revealedCount()).toBe(0);
    expect(fog.cellCount()).toBe(10 * 10);
    expect(fog.fraction()).toBe(0);
    expect(fog.isRevealed(0, 0)).toBe(false);
  });

  it("reveals a single cell on a dig at zero radius", () => {
    const fog = createFogField({ bounds: BOUNDS, cellSize: 2 });
    const changed = fog.reveal(0, 0);
    expect(changed).toBe(1);
    expect(fog.isRevealed(0, 0)).toBe(true);
    expect(fog.isRevealed(6, 6)).toBe(false);
  });

  it("reveals a disc of cells within radius", () => {
    const fog = createFogField({ bounds: BOUNDS, cellSize: 2 });
    const changed = fog.reveal(0, 0, 4);
    expect(changed).toBeGreaterThan(1);
    expect(fog.isRevealed(0, 0)).toBe(true);
    expect(fog.isRevealed(2, 0)).toBe(true);
  });

  it("keeps cells revealed once cleared (reveal-on-event)", () => {
    const fog = createFogField({ bounds: BOUNDS, cellSize: 2 });
    fog.reveal(0, 0, 2);
    const first = fog.revealedCount();
    const again = fog.reveal(0, 0, 2);
    expect(again).toBe(0);
    expect(fog.revealedCount()).toBe(first);
  });

  it("reveals a trail along a walked segment", () => {
    const fog = createFogField({ bounds: BOUNDS, cellSize: 2 });
    fog.revealAlong([-8, -8], [8, 8], 1);
    expect(fog.isRevealed(-8, -8)).toBe(true);
    expect(fog.isRevealed(0, 0)).toBe(true);
    expect(fog.isRevealed(8, 8)).toBe(true);
    expect(fog.isRevealed(-8, 8)).toBe(false);
  });

  it("exposes a stable cell snapshot that changes only on reveal", () => {
    const fog = createFogField({ bounds: BOUNDS, cellSize: 2 });
    const before = fog.cells();
    expect(fog.cells()).toBe(before);
    fog.reveal(0, 0);
    const after = fog.cells();
    expect(after).not.toBe(before);
    expect(after.revealedCount).toBe(1);
    expect(after.cols).toBe(10);
  });

  it("notifies subscribers and supports reset", () => {
    const fog = createFogField({ bounds: BOUNDS, cellSize: 2 });
    let calls = 0;
    fog.subscribe(() => {
      calls += 1;
    });
    fog.reveal(0, 0);
    fog.reveal(0, 0);
    expect(calls).toBe(1);
    fog.reset();
    expect(calls).toBe(2);
    expect(fog.revealedCount()).toBe(0);
  });

  it("seeds initially revealed cells", () => {
    const fog = createFogField({ bounds: BOUNDS, cellSize: 2, revealed: [0, 1, 2] });
    expect(fog.revealedCount()).toBe(3);
    expect(fog.isRevealedCell(0, 0)).toBe(true);
  });
});
