import { describe, expect, test } from "bun:test";

import {
  createFogState,
  enemyDrawn,
  FOG_BOUNDS,
  fogLevel,
  refreshSight,
  sightRadiusFor,
  type FogState,
} from "./fog";
import { FOG_CELL, SIGHT_RADIUS, SIGHT_RADIUS_BUILDING, SIGHT_RADIUS_HERO } from "./tuning";

function fog(): FogState {
  return createFogState(FOG_CELL);
}

describe("fog of war", () => {
  test("a unit outside vision is not drawn", () => {
    const field = fog();
    refreshSight(field, [{ x: 0, z: 0, radius: SIGHT_RADIUS }]);
    // Inside the scout's eye: visible, and a Marauder standing there is on the map.
    expect(fogLevel(field, 0, 0)).toBe("visible");
    expect(enemyDrawn(field, 0, 4)).toBe(true);
    // Beyond it, on ground never seen: nothing is drawn there.
    expect(fogLevel(field, 30, 30)).toBe("unseen");
    expect(enemyDrawn(field, 30, 30)).toBe(false);
    // Just past the radius, still unseen — the check is the radius, not the map edge.
    expect(enemyDrawn(field, SIGHT_RADIUS + FOG_CELL * 2, 0)).toBe(false);
  });

  test("explored ground dims instead of vanishing once the army moves on", () => {
    const field = fog();
    refreshSight(field, [{ x: 0, z: 0, radius: SIGHT_RADIUS }]);
    expect(fogLevel(field, 0, 0)).toBe("visible");

    // The scout marches away: its old ground is still known, but nothing there is seen now.
    refreshSight(field, [{ x: 36, z: 36, radius: SIGHT_RADIUS }]);
    expect(fogLevel(field, 0, 0)).toBe("explored");
    expect(enemyDrawn(field, 0, 0)).toBe(false);
    expect(fogLevel(field, 36, 36)).toBe("visible");
    expect(fogLevel(field, -30, -30)).toBe("unseen");
  });

  test("the visible grid is recomputed every tick, the explored grid only grows", () => {
    const field = fog();
    refreshSight(field, [{ x: -20, z: 0, radius: 10 }]);
    const exploredBefore = field.explored.revealedCount();
    expect(field.visible.revealedCount()).toBeGreaterThan(0);

    refreshSight(field, [{ x: 20, z: 0, radius: 10 }]);

    expect(fogLevel(field, -20, 0)).toBe("explored");
    expect(field.explored.revealedCount()).toBeGreaterThan(exploredBefore);
    // Vision is a snapshot of the current eyes, never a running total.
    expect(field.visible.isRevealed(-20, 0)).toBe(false);
    expect(field.visible.isRevealed(20, 0)).toBe(true);
  });

  test("no eyes means no sight", () => {
    const field = fog();
    refreshSight(field, [{ x: 0, z: 0, radius: SIGHT_RADIUS }]);
    refreshSight(field, []);
    expect(field.visible.revealedCount()).toBe(0);
    expect(fogLevel(field, 0, 0)).toBe("explored");
  });

  test("sight ranges: buildings light more ground than a line soldier, the hero scouts furthest", () => {
    expect(sightRadiusFor("hero", "unit")).toBe(SIGHT_RADIUS_HERO);
    expect(sightRadiusFor("keep_player", "building")).toBe(SIGHT_RADIUS_BUILDING);
    expect(sightRadiusFor("footman", "unit")).toBe(SIGHT_RADIUS);
    expect(SIGHT_RADIUS_BUILDING).toBeGreaterThan(SIGHT_RADIUS);
    expect(SIGHT_RADIUS_HERO).toBeGreaterThan(SIGHT_RADIUS_BUILDING);
  });

  test("the grid frames the whole battlefield", () => {
    const field = fog();
    const cells = field.explored.cells();
    expect(cells.minX).toBe(FOG_BOUNDS.minX);
    expect(cells.minZ).toBe(FOG_BOUNDS.minZ);
    expect(cells.cols * cells.cellSize).toBeGreaterThanOrEqual(FOG_BOUNDS.maxX - FOG_BOUNDS.minX);
    expect(cells.rows * cells.cellSize).toBeGreaterThanOrEqual(FOG_BOUNDS.maxZ - FOG_BOUNDS.minZ);
  });
});
