import { describe, expect, test } from "bun:test";

import {
  computeGameplayRect,
  detectLayoutCollisions,
  formatLayoutCollisions,
  intersects,
  isMobileMode,
  orientationOf,
  overlapArea,
  resolveLayoutMode,
  type LayoutRect,
  type LayoutRegion,
} from "./gameLayout";

const rect = (left: number, top: number, right: number, bottom: number): LayoutRect => ({ left, top, right, bottom });

describe("intersects / overlapArea", () => {
  test("overlapping rects", () => {
    expect(intersects(rect(0, 0, 10, 10), rect(5, 5, 15, 15))).toBe(true);
    expect(overlapArea(rect(0, 0, 10, 10), rect(5, 5, 15, 15))).toBe(25);
  });
  test("touching edges do not intersect", () => {
    expect(intersects(rect(0, 0, 10, 10), rect(10, 0, 20, 10))).toBe(false);
    expect(overlapArea(rect(0, 0, 10, 10), rect(10, 0, 20, 10))).toBe(0);
  });
  test("disjoint rects have no overlap", () => {
    expect(overlapArea(rect(0, 0, 5, 5), rect(20, 20, 30, 30))).toBe(0);
  });
});

describe("resolveLayoutMode", () => {
  test("coarse pointer + portrait viewport is mobile-portrait", () => {
    expect(resolveLayoutMode({ width: 390, height: 844, coarsePointer: true })).toBe("mobile-portrait");
  });
  test("coarse pointer + landscape viewport is mobile-landscape", () => {
    expect(resolveLayoutMode({ width: 844, height: 390, coarsePointer: true })).toBe("mobile-landscape");
  });
  test("mobile-unsupported game on coarse pointer falls to desktop mode", () => {
    expect(resolveLayoutMode({ width: 390, height: 844, coarsePointer: true, mobileSupported: false })).toBe(
      "desktop-compact",
    );
  });
  test("wide fine-pointer viewport is desktop-wide", () => {
    expect(resolveLayoutMode({ width: 1600, height: 900, coarsePointer: false })).toBe("desktop-wide");
  });
  test("narrow fine-pointer viewport is desktop-compact", () => {
    expect(resolveLayoutMode({ width: 700, height: 900, coarsePointer: false })).toBe("desktop-compact");
  });
  test("orientationOf and isMobileMode", () => {
    expect(orientationOf(844, 390)).toBe("landscape");
    expect(orientationOf(390, 844)).toBe("portrait");
    expect(isMobileMode("mobile-landscape")).toBe(true);
    expect(isMobileMode("desktop-wide")).toBe(false);
  });
});

describe("detectLayoutCollisions", () => {
  const hud = (id: string, r: LayoutRect, extra?: Partial<LayoutRegion>): LayoutRegion => ({
    id,
    kind: "hud",
    rect: r,
    collisionPolicy: "forbid",
    ...extra,
  });

  test("reports a forbidden overlap naming both regions", () => {
    const collisions = detectLayoutCollisions([
      hud("survey-map", rect(0, 0, 100, 100)),
      { id: "throttle", kind: "control", rect: rect(50, 50, 150, 150), collisionPolicy: "forbid" },
    ]);
    expect(collisions).toHaveLength(1);
    expect(collisions[0].a).toBe("survey-map");
    expect(collisions[0].b).toBe("throttle");
    expect(collisions[0].area).toBe(2500);
    expect(collisions[0].severity).toBe("forbid");
  });

  test("allow policy suppresses the report", () => {
    const collisions = detectLayoutCollisions([
      hud("a", rect(0, 0, 100, 100)),
      { id: "b", kind: "screen", rect: rect(0, 0, 100, 100), collisionPolicy: "allow" },
    ]);
    expect(collisions).toHaveLength(0);
  });

  test("allowOverlapWith opts a pair out", () => {
    const collisions = detectLayoutCollisions([
      hud("a", rect(0, 0, 100, 100), { allowOverlapWith: ["b"] }),
      hud("b", rect(0, 0, 100, 100)),
    ]);
    expect(collisions).toHaveLength(0);
  });

  test("shared collisionGroup opts a pair out", () => {
    const collisions = detectLayoutCollisions([
      hud("a", rect(0, 0, 100, 100), { collisionGroup: "stack" }),
      hud("b", rect(0, 0, 100, 100), { collisionGroup: "stack" }),
    ]);
    expect(collisions).toHaveLength(0);
  });

  test("sub-minArea overlaps are ignored", () => {
    const collisions = detectLayoutCollisions([
      hud("a", rect(0, 0, 100, 100)),
      hud("b", rect(99, 99, 199, 199)),
    ]);
    expect(collisions).toHaveLength(0);
  });

  test("two warn regions produce a warn severity", () => {
    const collisions = detectLayoutCollisions([
      hud("a", rect(0, 0, 100, 100), { collisionPolicy: "warn" }),
      hud("b", rect(0, 0, 100, 100), { collisionPolicy: "warn" }),
    ]);
    expect(collisions[0].severity).toBe("warn");
  });
});

describe("formatLayoutCollisions", () => {
  test("empty set yields empty string", () => {
    expect(formatLayoutCollisions([])).toBe("");
  });
  test("formats area with thousands separators", () => {
    const text = formatLayoutCollisions([
      { a: "survey-map", b: "pursuit", kindA: "hud", kindB: "hud", area: 14820, severity: "forbid" },
    ]);
    expect(text).toContain("survey-map intersects pursuit by 14,820 px²");
    expect(text.startsWith("JGENGINE MOBILE LAYOUT COLLISION")).toBe(true);
  });
});

describe("computeGameplayRect", () => {
  test("carves reserved control zones and safe areas from the viewport", () => {
    const viewport = rect(0, 0, 800, 400);
    const gameplay = computeGameplayRect(viewport, { top: 10, right: 0, bottom: 0, left: 0 }, [
      rect(0, 340, 200, 400), // bottom-left dock
    ]);
    expect(gameplay.top).toBe(10);
    expect(gameplay.bottom).toBe(340);
  });
});
