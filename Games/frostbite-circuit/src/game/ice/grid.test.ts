import { describe, expect, test } from "bun:test";

import {
  advanceLapBoundary,
  createIceWorld,
  iceCellAt,
  isOpenAt,
  markCrossed,
  withIceCell,
  type IceGridConfig,
} from "./grid";

const CONFIG: IceGridConfig = { cellSize: 2, originX: 0, originZ: 0, width: 4, height: 4 };

function seededWorld() {
  const base = createIceWorld(CONFIG);
  return withIceCell(base, 1, 1, { status: "solid", corridor: "mid", corner: 0, crossedThisLap: false });
}

describe("ice cell stress state machine", () => {
  test("an uncrossed cell never degrades at a lap boundary", () => {
    const world = seededWorld();
    const { world: next, changed } = advanceLapBoundary(world);
    expect(changed).toHaveLength(0);
    expect(iceCellAt(next, 2, 2)?.status).toBe("solid");
  });

  test("solid -> cracked exactly on the lap boundary it was crossed", () => {
    let world = seededWorld();
    world = markCrossed(world, 2, 2);
    expect(iceCellAt(world, 2, 2)?.status).toBe("solid");
    const { world: afterLap } = advanceLapBoundary(world);
    expect(iceCellAt(afterLap, 2, 2)?.status).toBe("cracked");
    expect(iceCellAt(afterLap, 2, 2)?.crossedThisLap).toBe(false);
  });

  test("cracked -> open only when crossed again in a later lap", () => {
    let world = seededWorld();
    world = markCrossed(world, 2, 2);
    ({ world } = advanceLapBoundary(world));
    expect(iceCellAt(world, 2, 2)?.status).toBe("cracked");

    const { world: untouchedLap } = advanceLapBoundary(world);
    expect(iceCellAt(untouchedLap, 2, 2)?.status).toBe("cracked");

    world = markCrossed(world, 2, 2);
    const { world: openLap, changed } = advanceLapBoundary(world);
    expect(iceCellAt(openLap, 2, 2)?.status).toBe("open");
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ from: "cracked", to: "open" });
  });

  test("open water is terminal — crossing it again never changes status", () => {
    let world = seededWorld();
    world = markCrossed(world, 2, 2);
    ({ world } = advanceLapBoundary(world));
    world = markCrossed(world, 2, 2);
    ({ world } = advanceLapBoundary(world));
    expect(iceCellAt(world, 2, 2)?.status).toBe("open");
    world = markCrossed(world, 2, 2);
    const { world: stillOpen } = advanceLapBoundary(world);
    expect(iceCellAt(stillOpen, 2, 2)?.status).toBe("open");
    expect(isOpenAt(stillOpen, 2, 2)).toBe(true);
  });

  test("crossings are tracked per lap — marking twice in one lap is idempotent", () => {
    let world = seededWorld();
    world = markCrossed(world, 2, 2);
    world = markCrossed(world, 2, 2);
    const { changed } = advanceLapBoundary(world);
    expect(changed).toHaveLength(1);
  });

  test("a cell outside the active grid is null and never crosses", () => {
    const world = seededWorld();
    expect(iceCellAt(world, 100, 100)).toBeNull();
    const marked = markCrossed(world, 100, 100);
    expect(marked).toBe(world);
  });
});
