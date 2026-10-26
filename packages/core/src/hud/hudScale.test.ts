import { describe, expect, test } from "bun:test";

import {
  DEFAULT_HUD_DESIGN_SIZE,
  hudScaleForViewport,
  overflowingPanels,
  rectIntersectsViewport,
  rectOverflow,
  resolveHudFit,
} from "./hudScale";

const fit = resolveHudFit(undefined, false);

describe("hudScaleForViewport", () => {
  test("viewport at design size scales 1", () => {
    expect(hudScaleForViewport(fit, DEFAULT_HUD_DESIGN_SIZE)).toBe(1);
  });

  test("larger viewport never upscales past maxScale", () => {
    expect(hudScaleForViewport(fit, { width: 3840, height: 2160 })).toBe(1);
  });

  test("phone portrait viewport scales by the limiting axis", () => {
    const scale = hudScaleForViewport(fit, { width: 390, height: 844 });
    expect(scale).toBeCloseTo(0.4, 5);
  });

  test("landscape phone scales by height", () => {
    const scale = hudScaleForViewport(fit, { width: 844, height: 390 });
    expect(scale).toBeCloseTo(Math.max(0.4, 390 / 900), 5);
  });

  test("minScale floors the shrink", () => {
    expect(hudScaleForViewport(fit, { width: 100, height: 100 })).toBe(fit.minScale);
  });

  test("degenerate viewport returns 1", () => {
    expect(hudScaleForViewport(fit, { width: 0, height: 0 })).toBe(1);
    expect(hudScaleForViewport(fit, { width: Number.NaN, height: 900 })).toBe(1);
  });
});

describe("resolveHudFit", () => {
  test("mobile override wins on mobile only", () => {
    const config = { designSize: { width: 1920, height: 1080 }, mobile: { designSize: { width: 800, height: 450 }, minScale: 0.6 } };
    expect(resolveHudFit(config, false).designSize.width).toBe(1920);
    const mobile = resolveHudFit(config, true);
    expect(mobile.designSize.width).toBe(800);
    expect(mobile.minScale).toBe(0.6);
  });
});

describe("rectOverflow", () => {
  const viewport = { width: 390, height: 844 };

  test("rect inside viewport reports null", () => {
    expect(rectOverflow({ x: 10, y: 10, width: 100, height: 50 }, viewport)).toBeNull();
  });

  test("tolerance absorbs sub-pixel spill", () => {
    expect(rectOverflow({ x: -1, y: 0, width: 390, height: 844 }, viewport)).toBeNull();
  });

  test("rect past the right edge reports the distance", () => {
    const overflow = rectOverflow({ x: 300, y: 10, width: 200, height: 50 }, viewport);
    expect(overflow).toEqual({ left: 0, top: 0, right: 110, bottom: 0 });
  });

  test("desktop-sized panel on a phone overflows both axes", () => {
    const overflow = rectOverflow({ x: 0, y: 0, width: 1600, height: 900 }, viewport);
    expect(overflow?.right).toBe(1210);
    expect(overflow?.bottom).toBe(56);
  });
});

describe("rectIntersectsViewport", () => {
  const viewport = { width: 390, height: 844 };

  test("a shown panel intersects", () => {
    expect(rectIntersectsViewport({ x: 10, y: 10, width: 100, height: 50 }, viewport)).toBe(true);
  });

  test("a panel clipped at an edge still intersects (it is partly shown)", () => {
    expect(rectIntersectsViewport({ x: -40, y: 10, width: 100, height: 50 }, viewport)).toBe(true);
  });

  test("a drawer parked fully off the left edge does not intersect", () => {
    expect(rectIntersectsViewport({ x: -400, y: 10, width: 380, height: 600 }, viewport)).toBe(false);
  });

  test("a menu parked fully below the viewport does not intersect", () => {
    expect(rectIntersectsViewport({ x: 10, y: 900, width: 200, height: 300 }, viewport)).toBe(false);
  });
});

describe("overflowingPanels", () => {
  test("names only the escaping panels", () => {
    const result = overflowingPanels(
      [
        { id: "minimap", rect: { x: 10, y: 10, width: 100, height: 100 } },
        { id: "quest-log", rect: { x: 350, y: 10, width: 300, height: 200 } },
      ],
      { width: 390, height: 844 },
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("quest-log");
    expect(result[0]?.right).toBe(260);
  });

  test("a closed drawer parked off-screen is not reported", () => {
    const result = overflowingPanels(
      [{ id: "mail", rect: { x: -400, y: 10, width: 380, height: 600 } }],
      { width: 390, height: 844 },
    );
    expect(result).toHaveLength(0);
  });
});
