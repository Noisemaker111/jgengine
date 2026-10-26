import { describe, expect, test } from "bun:test";

import type { HudRect } from "./hudLayout";
import { arrangeHudPanels, type HudPanelClaim } from "./hudPanelLayout";

const CHIP = { width: 90, height: 26 };

function overlaps(a: HudRect, b: HudRect): boolean {
  return Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);
}

function noOverlaps(rects: Record<string, HudRect>): void {
  const ids = Object.keys(rects);
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      expect(`${ids[i]}∩${ids[j]}:${overlaps(rects[ids[i]!]!, rects[ids[j]!]!)}`).toBe(`${ids[i]}∩${ids[j]}:false`);
    }
  }
}

function inside(rects: Record<string, HudRect>, width: number, height: number, scale: number): void {
  for (const rect of Object.values(rects)) {
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(width / scale + 0.01);
    expect(rect.y + rect.height).toBeLessThanOrEqual(height / scale + 0.01);
  }
}

describe("arrangeHudPanels", () => {
  test("panels with room sit at their anchors and stack outward in order", () => {
    const claims: HudPanelClaim[] = [
      { id: "keep", anchor: "top-left", size: { width: 200, height: 60 } },
      { id: "horn", anchor: "top-left", order: 1, size: { width: 120, height: 40 } },
      { id: "build", anchor: "bottom", size: { width: 400, height: 90 } },
      { id: "stones", anchor: "bottom-right", size: { width: 180, height: 70 } },
    ];
    const layout = arrangeHudPanels(claims, { viewport: { width: 1600, height: 900 } });
    expect(layout.scale).toBe(1);
    expect(layout.collapsed).toEqual([]);
    expect(layout.rects.keep).toEqual({ x: 16, y: 16, width: 200, height: 60 });
    expect(layout.rects.horn).toEqual({ x: 16, y: 86, width: 120, height: 40 });
    expect(layout.rects.build).toEqual({ x: 600, y: 794, width: 400, height: 90 });
    expect(layout.rects.stones).toEqual({ x: 1404, y: 814, width: 180, height: 70 });
  });

  test("a mid-edge stack that would cover a corner stack slides clear of it", () => {
    // Scrap Signal at 800x450: the left-edge column ran into the top-left terminal.
    const claims: HudPanelClaim[] = [
      { id: "dead-air", anchor: "top-left", priority: "critical", size: { width: 170, height: 120 } },
      { id: "missions", anchor: "left", size: { width: 160, height: 110 }, chipSize: CHIP },
    ];
    const layout = arrangeHudPanels(claims, { viewport: { width: 800, height: 450 } });
    noOverlaps(layout.rects);
    expect(layout.rects.missions!.x).toBe(16);
    expect(layout.collapsed).toEqual([]);
  });

  test("a centred bar and a corner card share a narrow bottom edge", () => {
    // Beacon Bastion at 800x450: the build rack ran into the ability stones.
    const claims: HudPanelClaim[] = [
      { id: "build-bar", anchor: "bottom", priority: "critical", size: { width: 420, height: 90 } },
      { id: "rites", anchor: "bottom-right", size: { width: 190, height: 70 }, chipSize: CHIP },
      { id: "tower", anchor: "right", size: { width: 150, height: 180 }, chipSize: CHIP },
    ];
    const layout = arrangeHudPanels(claims, { viewport: { width: 800, height: 450 } });
    noOverlaps(layout.rects);
    inside(layout.rects, 800, 450, layout.scale);
    expect(layout.overlapping).toEqual([]);
  });

  test("when nothing fits, the lowest priority folds into its toggle before anything shrinks", () => {
    const claims: HudPanelClaim[] = [
      { id: "map", anchor: "top-left", priority: "critical", size: { width: 300, height: 300 } },
      { id: "log", anchor: "left", priority: "tertiary", size: { width: 300, height: 300 }, chipSize: CHIP },
    ];
    const layout = arrangeHudPanels(claims, { viewport: { width: 400, height: 400 } });
    expect(layout.scale).toBe(1);
    expect(layout.collapsed).toEqual(["log"]);
    expect(layout.rects.log).toMatchObject(CHIP);
    noOverlaps(layout.rects);
  });

  test("critical panels never fold; the HUD shrinks until they fit", () => {
    const claims: HudPanelClaim[] = [
      { id: "a", anchor: "top-left", priority: "critical", size: { width: 300, height: 200 } },
      { id: "b", anchor: "bottom-left", priority: "critical", size: { width: 300, height: 200 } },
    ];
    const layout = arrangeHudPanels(claims, { viewport: { width: 400, height: 400 } });
    expect(layout.collapsed).toEqual([]);
    expect(layout.scale).toBeLessThan(1);
    expect(layout.overlapping).toEqual([]);
    noOverlaps(layout.rects);
    inside(layout.rects, 400, 400, layout.scale);
  });

  test("panels keep clear of reserved zones such as a touch dock", () => {
    const claims: HudPanelClaim[] = [{ id: "hotbar", anchor: "bottom-left", priority: "critical", size: { width: 200, height: 50 } }];
    const dock = { left: 0, top: 300, right: 260, bottom: 390 };
    const layout = arrangeHudPanels(claims, { viewport: { width: 844, height: 390 }, reserved: [dock] });
    const rect = layout.rects.hotbar!;
    expect(rect.y + rect.height).toBeLessThanOrEqual(dock.top);
  });

  test("safe-area insets push panels in from the notch", () => {
    const claims: HudPanelClaim[] = [{ id: "clock", anchor: "top-left", size: { width: 100, height: 40 } }];
    const layout = arrangeHudPanels(claims, { viewport: { width: 844, height: 390 }, insets: { top: 0, right: 0, bottom: 0, left: 47 } });
    expect(layout.rects.clock!.x).toBe(63);
  });

  test("the same claims always give the same layout", () => {
    const claims: HudPanelClaim[] = [
      { id: "a", anchor: "top", size: { width: 500, height: 60 } },
      { id: "b", anchor: "top-left", size: { width: 200, height: 80 }, chipSize: CHIP },
      { id: "c", anchor: "top-right", size: { width: 200, height: 80 }, chipSize: CHIP },
    ];
    const request = { viewport: { width: 800, height: 450 }, scale: 0.85 };
    expect(arrangeHudPanels(claims, request)).toEqual(arrangeHudPanels(claims, request));
    noOverlaps(arrangeHudPanels(claims, request).rects);
  });
});
