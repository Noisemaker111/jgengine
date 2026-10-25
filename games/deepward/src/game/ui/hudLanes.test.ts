import { describe, expect, test } from "bun:test";
import { formatHudOverlapReport, hudBlockOverlaps, resolveHudLanes, type HudLaneSlot } from "@jgengine/react/hudLanes";
import { HUD_PANELS, placement } from "./hudPanels";

const VIEWPORTS = [
  { size: "wide", width: 1600, height: 900, zoom: 1 },
  { size: "compact", width: 844, height: 390, zoom: 0.86 },
  { size: "portrait", width: 390, height: 844, zoom: 0.86 },
] as const;

/** What `HudCanvas` resolves for this game, from the claim table and the measured panel sizes. */
function slots(size: "wide" | "compact" | "portrait", zoom: number): HudLaneSlot[] {
  return HUD_PANELS.map(claim => ({ ...placement(claim.id, size === "portrait"), width: claim.measured[size].w / zoom, height: claim.measured[size].h / zoom }));
}
/** The lanes are resolved inside the canvas zoom, so the frame and every measured on-screen size divide by it. */
function overlapsAt(size: "wide" | "compact" | "portrait", width: number, height: number, zoom: number) {
  const frame = { width: width / zoom, height: height / zoom };
  const layout = resolveHudLanes(slots(size, zoom), frame);
  const blocks = layout.placements.map((pl) => ({ id: pl.id, rect: pl.rect }));
  return { layout, overlaps: hudBlockOverlaps(blocks), report: formatHudOverlapReport(hudBlockOverlaps(blocks), frame) };
}

describe("Deepward's HUD lanes", () => {
  test("every block claims a lane, so no panel places itself", () => {
    expect(HUD_PANELS.every(claim => claim.lane.length > 0)).toBe(true);
    expect(new Set(HUD_PANELS.map(claim => claim.id)).size).toBe(HUD_PANELS.length);
    expect(placement("home")).toEqual({ id: "home", anchor: "top-left", lane: "rail", order: 0 });
    expect(() => placement("missing" as "home")).toThrow(/no HUD lane/);
  });

  test("the visor keeps its readouts on the edges: dial bottom-left, kit bottom-right, nothing in the centre", () => {
    const anchors = Object.fromEntries(HUD_PANELS.map(claim => [claim.id, claim.anchor]));
    expect(anchors.air).toBe("bottom-left");
    expect(anchors.haul).toBe("bottom-right");
    expect(anchors.depth).toBe("top");
    expect(HUD_PANELS.some(claim => claim.anchor === "center")).toBe(false);
  });

  test("no two blocks intersect at 1600x900, at 844x390 or on a 390x844 portrait phone", () => {
    for (const { width, height, size, zoom } of VIEWPORTS) {
      const { overlaps, report } = overlapsAt(size, width, height, zoom);
      expect(overlaps).toEqual([]);
      expect(report).toBe("");
    }
  });

  test("the departure docket stays clear of the bottom band at every size", () => {
    for (const { width, height, size, zoom } of VIEWPORTS) {
      const { layout } = overlapsAt(size, width, height, zoom);
      const docket = layout.rects.home!;
      const bottom = Math.min(layout.rects.radio!.y, layout.rects.prompt!.y, size === "portrait" ? Infinity : layout.rects.air!.y);
      expect(docket.y + docket.height).toBeLessThan(bottom);
    }
  });

  test("a portrait phone moves the dial and the kit to the top corners, clear of the bottom lane", () => {
    expect(placement("air", true).anchor).toBe("top-left");
    expect(placement("haul", true).anchor).toBe("top-right");
    expect(placement("depth", true).anchor).toBe("bottom");
  });
});
