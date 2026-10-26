import { describe, expect, test } from "bun:test";

import {
  formatHudOverlapReport,
  hudBlockOverlaps,
  resolveHudLanes,
  type HudLaneSlot,
} from "./hudLanes";

const DESKTOP = { width: 1600, height: 900 };
const PHONE_LANDSCAPE = { width: 844, height: 390 };

function intersecting(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
  return (
    Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) &&
    Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y)
  );
}

describe("resolveHudLanes", () => {
  test("two blocks in one lane do not overlap at 1600x900", () => {
    const slots: HudLaneSlot[] = [
      { id: "score", anchor: "top-left", lane: "status", width: 240, height: 80 },
      { id: "quest-log", anchor: "top-left", lane: "status", width: 320, height: 160 },
    ];
    const { rects } = resolveHudLanes(slots, DESKTOP);

    expect(intersecting(rects["score"]!, rects["quest-log"]!)).toBe(false);
    expect(rects["score"]!.y).toBe(0);
    expect(rects["quest-log"]!.y).toBe(90);
    expect(rects["quest-log"]!.y + rects["quest-log"]!.height).toBeLessThanOrEqual(DESKTOP.height);
  });

  test("two blocks in one lane do not overlap at 844x390", () => {
    const slots: HudLaneSlot[] = [
      { id: "score", anchor: "top-left", lane: "status", width: 240, height: 80 },
      { id: "quest-log", anchor: "top-left", lane: "status", width: 320, height: 160 },
    ];
    const { rects } = resolveHudLanes(slots, PHONE_LANDSCAPE);

    expect(intersecting(rects["score"]!, rects["quest-log"]!)).toBe(false);
    expect(rects["quest-log"]!.y).toBe(90);
    expect(rects["quest-log"]!.y + rects["quest-log"]!.height).toBeLessThanOrEqual(PHONE_LANDSCAPE.height);
  });

  test("lanes in one anchor sit side by side, and every block clears the others", () => {
    const slots: HudLaneSlot[] = [
      { id: "health", anchor: "top-left", lane: "vitals", width: 200, height: 60 },
      { id: "stamina", anchor: "top-left", lane: "vitals", order: 1, width: 200, height: 40 },
      { id: "quests", anchor: "top-left", lane: "journal", width: 260, height: 120 },
    ];
    const { rects } = resolveHudLanes(slots, DESKTOP);

    expect(rects["health"]!.x).toBe(0);
    expect(rects["quests"]!.x).toBe(210);
    expect(rects["health"]!.y).toBe(0);
    expect(rects["stamina"]!.y).toBe(70);
    for (const a of ["health", "stamina", "quests"] as const) {
      for (const b of ["health", "stamina", "quests"] as const) {
        if (a === b) continue;
        expect(intersecting(rects[a]!, rects[b]!)).toBe(false);
      }
    }
  });

  test("a bottom anchor stacks upward and stays inside the frame", () => {
    const slots: HudLaneSlot[] = [
      { id: "hint", anchor: "bottom-left", lane: "prompts", width: 300, height: 40 },
      { id: "log", anchor: "bottom-left", lane: "prompts", order: 1, width: 300, height: 100 },
    ];
    const { rects } = resolveHudLanes(slots, DESKTOP);

    expect(intersecting(rects["hint"]!, rects["log"]!)).toBe(false);
    expect(rects["log"]!.y + rects["log"]!.height).toBe(DESKTOP.height);
    expect(rects["hint"]!.y).toBeGreaterThanOrEqual(0);
  });

  test("order controls the stack position", () => {
    const slots: HudLaneSlot[] = [
      { id: "late", anchor: "top-left", lane: "status", order: 2, width: 100, height: 30 },
      { id: "early", anchor: "top-left", lane: "status", order: 1, width: 100, height: 30 },
    ];
    const { rects } = resolveHudLanes(slots, DESKTOP);
    expect(rects["early"]!.y).toBeLessThan(rects["late"]!.y);
  });

  test("a game override keeps the exact rectangle and leaves the lane alone", () => {
    const override = { x: 700, y: 400, width: 180, height: 90 };
    const slots: HudLaneSlot[] = [
      { id: "score", anchor: "top-left", lane: "status", width: 240, height: 80 },
      { id: "pinned", anchor: "top-left", lane: "status", width: 100, height: 50, rect: override },
    ];
    const { rects } = resolveHudLanes(slots, DESKTOP);

    expect(rects["pinned"]).toEqual(override);
    expect(rects["score"]).toEqual({ x: 0, y: 0, width: 240, height: 80 });
  });
});

describe("hudBlockOverlaps", () => {
  test("names both blocks when their rectangles intersect", () => {
    const overlaps = hudBlockOverlaps([
      { id: "score", rect: { x: 0, y: 0, width: 240, height: 80 } },
      { id: "quest-log", rect: { x: 0, y: 60, width: 240, height: 160 } },
    ]);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]!.a).toBe("score");
    expect(overlaps[0]!.b).toBe("quest-log");
    expect(overlaps[0]!.area).toBe(240 * 20);
  });

  test("stays silent for lane output at both viewports", () => {
    const slots: HudLaneSlot[] = [
      { id: "score", anchor: "top-left", lane: "status", width: 240, height: 80 },
      { id: "quest-log", anchor: "top-left", lane: "status", width: 320, height: 160 },
    ];
    for (const viewport of [DESKTOP, PHONE_LANDSCAPE]) {
      const { rects } = resolveHudLanes(slots, viewport);
      const bounds = Object.entries(rects).map(([id, rect]) => ({ id, rect }));
      expect(hudBlockOverlaps(bounds)).toEqual([]);
    }
  });

  test("touching edges are not an overlap", () => {
    expect(
      hudBlockOverlaps([
        { id: "a", rect: { x: 0, y: 0, width: 100, height: 50 } },
        { id: "b", rect: { x: 0, y: 50, width: 100, height: 50 } },
      ]),
    ).toEqual([]);
  });

  test("the report names both ids and the viewport", () => {
    const overlaps = hudBlockOverlaps([
      { id: "score", rect: { x: 0, y: 0, width: 240, height: 80 } },
      { id: "quest-log", rect: { x: 0, y: 60, width: 240, height: 160 } },
    ]);
    const report = formatHudOverlapReport(overlaps, DESKTOP);
    expect(report).toContain("1600x900");
    expect(report).toContain("score");
    expect(report).toContain("quest-log");
    expect(formatHudOverlapReport([], DESKTOP)).toBe("");
  });
});
