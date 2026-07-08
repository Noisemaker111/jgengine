import { describe, expect, test } from "bun:test";

import {
  chaseTargetCell,
  farthestCorner,
  frightSecondsForLevel,
  ghostChainScore,
  ghostSpeedForLevel,
  scheduledMode,
  slideMove,
} from "./ai";
import { cellToWorld, CORNERS, GHOSTS, type Cell } from "./maze";

const hunter = GHOSTS.find((g) => g.id === "hunter")!;
const ambush = GHOSTS.find((g) => g.id === "ambush")!;
const shy = GHOSTS.find((g) => g.id === "shy")!;

describe("mode schedule", () => {
  test("alternates scatter and chase then locks to chase", () => {
    expect(scheduledMode(0)).toBe("scatter");
    expect(scheduledMode(10)).toBe("chase");
    expect(scheduledMode(30)).toBe("scatter");
    expect(scheduledMode(40)).toBe("chase");
  });
});

describe("ghost targeting", () => {
  const muncher: Cell = { c: 9, r: 10 };
  test("direct chaser targets the muncher tile", () => {
    expect(chaseTargetCell(hunter, muncher, { dc: 1, dr: 0 }, 5)).toEqual(muncher);
  });
  test("ambusher aims ahead of the muncher", () => {
    expect(chaseTargetCell(ambush, muncher, { dc: 0, dr: -1 }, 5)).toEqual({ c: 9, r: 6 });
  });
  test("leashed ghost chases when far, scatters when close", () => {
    expect(chaseTargetCell(shy, muncher, { dc: 0, dr: 0 }, 12)).toEqual(muncher);
    expect(chaseTargetCell(shy, muncher, { dc: 0, dr: 0 }, 3)).toEqual(shy.scatter);
  });
  test("frightened flee picks the farthest corner", () => {
    const far = farthestCorner({ c: 1, r: 1 }, CORNERS);
    expect(far).toEqual({ c: CORNERS[3]!.c, r: CORNERS[3]!.r });
  });
});

describe("wall sliding", () => {
  test("blocks movement into a wall but preserves the free axis", () => {
    const from = cellToWorld(1, 2);
    const into = cellToWorld(2, 2);
    const [x, z] = slideMove(from[0], from[2], into[0], from[2]);
    expect(x).toBe(from[0]);
    expect(z).toBe(from[2]);
  });
});

describe("difficulty scaling", () => {
  test("ghost speed climbs with level and caps out", () => {
    expect(ghostSpeedForLevel(1)).toBeCloseTo(3.6);
    expect(ghostSpeedForLevel(2)).toBeGreaterThan(ghostSpeedForLevel(1));
    expect(ghostSpeedForLevel(20)).toBe(ghostSpeedForLevel(50));
  });

  test("frightened window shrinks with level and floors out", () => {
    expect(frightSecondsForLevel(1)).toBe(7);
    expect(frightSecondsForLevel(4)).toBe(4);
    expect(frightSecondsForLevel(20)).toBe(3);
  });
});

describe("ghost chain scoring", () => {
  test("doubles per consecutive ghost then caps", () => {
    expect(ghostChainScore(1)).toBe(200);
    expect(ghostChainScore(2)).toBe(400);
    expect(ghostChainScore(3)).toBe(800);
    expect(ghostChainScore(4)).toBe(1600);
    expect(ghostChainScore(5)).toBe(1600);
  });
});
