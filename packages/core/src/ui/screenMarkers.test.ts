import { describe, expect, it } from "bun:test";

import {
  layoutScreenMarker,
  type ScreenMarkerLayout,
} from "./screenMarkers";

const VIEWPORT = { width: 800, height: 600 };

describe("layoutScreenMarker", () => {
  it("passes an on-screen point straight through", () => {
    const out = layoutScreenMarker({ x: 500, y: 320 }, VIEWPORT);
    expect(out.onScreen).toBe(true);
    expect(out.x).toBe(500);
    expect(out.y).toBe(320);
  });

  it("reports the center point as on-screen with a stable bearing", () => {
    const out = layoutScreenMarker({ x: 400, y: 300 }, VIEWPORT);
    expect(out.onScreen).toBe(true);
    // Degenerate center → downward bearing (PI/2), never NaN.
    expect(out.angle).toBeCloseTo(Math.PI / 2, 5);
  });

  it("clamps an off-screen point to the viewport edge inside the margin", () => {
    // Far to the right and below → clamps to an inner edge.
    const out = layoutScreenMarker({ x: 4000, y: 300 }, VIEWPORT, { margin: 24 });
    expect(out.onScreen).toBe(false);
    // Right edge inset by margin: 800 - 24 = 776.
    expect(out.x).toBeCloseTo(776, 5);
    // Straight right of center → y stays centered.
    expect(out.y).toBeCloseTo(300, 5);
    // Bearing points right.
    expect(out.angle).toBeCloseTo(0, 5);
  });

  it("keeps the clamped marker within the margin box on both axes", () => {
    const out = layoutScreenMarker({ x: 5000, y: 5000 }, VIEWPORT, { margin: 30 });
    expect(out.onScreen).toBe(false);
    expect(out.x).toBeLessThanOrEqual(VIEWPORT.width - 30 + 1e-6);
    expect(out.y).toBeLessThanOrEqual(VIEWPORT.height - 30 + 1e-6);
    expect(out.x).toBeGreaterThanOrEqual(30 - 1e-6);
    expect(out.y).toBeGreaterThanOrEqual(30 - 1e-6);
  });

  it("treats a behind-camera point as off-screen and flips the bearing", () => {
    // Behind-camera projections mirror through the origin: a target actually to
    // the right projects to the left with behind=true. The flip recovers "right".
    const out = layoutScreenMarker({ x: -1000, y: 300, behind: true }, VIEWPORT);
    expect(out.onScreen).toBe(false);
    expect(out.angle).toBeCloseTo(0, 5);
    expect(out.x).toBeCloseTo(VIEWPORT.width - 24, 5);
  });

  it("writes into a supplied out object without allocating", () => {
    const out: ScreenMarkerLayout = { onScreen: false, x: 0, y: 0, angle: 0 };
    const result = layoutScreenMarker({ x: 9999, y: 300 }, VIEWPORT, { out });
    expect(result).toBe(out);
    expect(out.onScreen).toBe(false);
  });

  it("survives a zero-size viewport without NaN", () => {
    const out = layoutScreenMarker({ x: 0, y: 0 }, { width: 0, height: 0 });
    expect(Number.isNaN(out.x)).toBe(false);
    expect(Number.isNaN(out.y)).toBe(false);
    expect(Number.isNaN(out.angle)).toBe(false);
  });
});
