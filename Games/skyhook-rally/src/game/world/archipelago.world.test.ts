import { describe, expect, test } from "bun:test";

import { CLOUD_TRIGGER_Y, generateArchipelago, ISLET_COUNT } from "./archipelago";

const SEED = "test-seed-dawn";

describe("skyhook-rally archipelago (custom environment, not environment())", () => {
  const archipelago = generateArchipelago(SEED);

  test("renders a populated scene", () => {
    expect(archipelago.islets.length).toBeGreaterThan(0);
    expect(archipelago.pylons.length).toBeGreaterThan(0);
    expect(archipelago.props.length).toBeGreaterThan(0);
  });

  test("has the expected island count (15+ per the content budget)", () => {
    expect(archipelago.islets.length).toBe(ISLET_COUNT);
    expect(archipelago.islets.length).toBeGreaterThanOrEqual(15);
  });

  test("has the expected pylon count (25+ per the content budget)", () => {
    expect(archipelago.pylons.length).toBeGreaterThanOrEqual(25);
  });

  test("has the expected dressing-prop count (50+ per the content budget)", () => {
    expect(archipelago.props.length).toBeGreaterThanOrEqual(50);
  });

  test("islets span varied, finite heights — not a flat scene", () => {
    const heights = archipelago.islets.map((i) => i.position.y);
    expect(heights.every((h) => Number.isFinite(h))).toBe(true);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(10);
    const tiers = new Set(archipelago.islets.map((i) => i.tier));
    expect(tiers.size).toBeGreaterThan(1);
  });

  test("every pylon's ring sits above its base mast", () => {
    for (const pylon of archipelago.pylons) expect(pylon.ringY).toBeGreaterThan(pylon.base.y);
  });

  test("dressing covers both building kinds and banners", () => {
    const kinds = new Set(archipelago.props.map((p) => p.kind));
    expect(kinds.has("windmill")).toBe(true);
    expect(kinds.has("hut")).toBe(true);
    expect(kinds.has("banner")).toBe(true);
  });

  test("clouds sit well below the lowest islet, at the respawn trigger layer", () => {
    expect(archipelago.clouds.length).toBeGreaterThan(0);
    const lowestIslet = Math.min(...archipelago.islets.map((i) => i.position.y));
    for (const cloud of archipelago.clouds) expect(cloud.position.y).toBeLessThan(lowestIslet);
    expect(Math.max(...archipelago.clouds.map((c) => c.position.y))).toBeLessThan(CLOUD_TRIGGER_Y + 20);
  });

  test("seeded generation is deterministic: the same seed reproduces the same layout", () => {
    const again = generateArchipelago(SEED);
    expect(again.islets).toEqual(archipelago.islets);
    expect(again.pylons).toEqual(archipelago.pylons);
    expect(again.props).toEqual(archipelago.props);
    expect(again.clouds).toEqual(archipelago.clouds);
  });

  test("a different seed produces a different layout", () => {
    const other = generateArchipelago("a-different-seed");
    expect(other.islets).not.toEqual(archipelago.islets);
  });
});
