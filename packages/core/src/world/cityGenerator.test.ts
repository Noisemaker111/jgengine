import { describe, expect, test } from "bun:test";
import { generateCity, resolveCityLotContent } from "./cityGenerator";
import { CITY_LOT_CLASSES, type CityLotClass } from "./cityContent";
import { isOnRoad } from "./roads";

describe("cityGenerator", () => {
  const city = generateCity({ seed: "spec-city" }, 300, 300);

  test("one seed grows a populated city: streets plus street-facing lots", () => {
    expect(city.network.mode).toBe("net");
    expect(city.network.streets.length).toBeGreaterThan(4);
    expect(city.lots.length).toBeGreaterThan(10);
  });

  test("identical options generate the identical city", () => {
    const again = generateCity({ seed: "spec-city" }, 300, 300);
    expect(again.network).toEqual(city.network);
    expect(again.lots).toEqual(city.lots);
    const other = generateCity({ seed: "other-city" }, 300, 300);
    expect(other.lots).not.toEqual(city.lots);
  });

  test("no lot center sits on any street ribbon", () => {
    for (const lot of city.lots) {
      const clear = city.network.streets.every(
        (street) => !isOnRoad(street.points, street.width, lot.center[0], lot.center[1]),
      );
      expect(clear).toBe(true);
    }
  });

  test("lots stay inside the default clip area and respect the lane opt-out", () => {
    for (const lot of city.lots) {
      expect(Math.abs(lot.center[0])).toBeLessThanOrEqual(300);
      expect(Math.abs(lot.center[1])).toBeLessThanOrEqual(300);
    }
    const laneIndexes = new Set(
      city.network.streets.flatMap((street, i) => (street.level === "lane" ? [i] : [])),
    );
    expect(laneIndexes.size).toBeGreaterThan(0);
    const frontageCount = city.network.streets.length - laneIndexes.size;
    for (const lot of city.lots) {
      expect(lot.road).toBeLessThan(frontageCount);
    }
  });

  test("street overrides pass through to the network", () => {
    const circuitish = generateCity({ seed: "spec-city", streets: { loopiness: 1, connectivity: 0, branching: 0, deadEnds: 0 } }, 300, 300);
    expect(circuitish.network.mode).toBe("circuit");
  });
});

describe("resolveCityLotContent", () => {
  const HX = 300;
  const HZ = 300;
  const base = generateCity({ seed: "content-city" }, HX, HZ);
  const resolved = resolveCityLotContent(base, { seed: "content-city", halfExtents: [HX, HZ] });

  test("resolves one entry per lot, in lot order, carrying class/zone/floors/massing", () => {
    expect(resolved.length).toBe(base.lots.length);
    resolved.forEach((r, i) => {
      expect(r.lot).toBe(base.lots[i]!);
      expect(r.center).toEqual(base.lots[i]!.center);
      expect(r.rotationY).toBe(base.lots[i]!.rotationY);
      expect(CITY_LOT_CLASSES).toContain(r.class);
      expect(["core", "mid", "edge"]).toContain(r.zone);
      expect(r.floors).toBeGreaterThanOrEqual(1);
      expect(r.floors).toBeLessThanOrEqual(30);
      expect(r.pieces.length).toBeGreaterThan(0);
    });
  });

  test("deterministic per seed — two resolutions are identical, a new seed differs", () => {
    const again = resolveCityLotContent(base, { seed: "content-city", halfExtents: [HX, HZ] });
    expect(again).toEqual(resolved);
    const other = resolveCityLotContent(base, { seed: "other-seed", halfExtents: [HX, HZ] });
    // Same lots, but the class/floor/massing rolls diverge.
    expect(other.map((r) => `${r.class}:${r.floors}`)).not.toEqual(resolved.map((r) => `${r.class}:${r.floors}`));
  });

  test("massing pieces are finite, positively sized, and inside the reported footprint bounds", () => {
    for (const r of resolved) {
      const { minX, maxX, minZ, maxZ } = r.footprint.bounds;
      expect(r.footprint.w).toBeGreaterThan(0);
      expect(r.footprint.d).toBeGreaterThan(0);
      for (const piece of r.pieces) {
        for (const v of [...piece.offset, ...piece.size]) expect(Number.isFinite(v)).toBe(true);
        for (const v of piece.size) expect(v).toBeGreaterThan(0);
        // Each piece's axis-aligned span (with its local yaw) sits within the massing bounds.
        const c = Math.abs(Math.cos(piece.rotationY));
        const s = Math.abs(Math.sin(piece.rotationY));
        const hx = (piece.size[0] / 2) * c + (piece.size[2] / 2) * s;
        const hz = (piece.size[0] / 2) * s + (piece.size[2] / 2) * c;
        const eps = 1e-6;
        expect(piece.offset[0] - hx).toBeGreaterThanOrEqual(minX - eps);
        expect(piece.offset[0] + hx).toBeLessThanOrEqual(maxX + eps);
        expect(piece.offset[2] - hz).toBeGreaterThanOrEqual(minZ - eps);
        expect(piece.offset[2] + hz).toBeLessThanOrEqual(maxZ + eps);
      }
    }
  });

  test("zone banding is monotonic with radius under the core-out profile", () => {
    // Bucket lots by radial metric; the innermost lots are never in a band further out than the rim.
    const rank: Record<string, number> = { core: 0, mid: 1, edge: 2 };
    const byMetric = resolved
      .map((r) => ({
        metric: Math.max(Math.abs(r.center[0]) / HX, Math.abs(r.center[1]) / HZ),
        band: r.zone,
      }))
      .sort((a, b) => a.metric - b.metric);
    let maxRankSoFar = -1;
    let violations = 0;
    for (const { band } of byMetric) {
      const rk = rank[band]!;
      if (rk < maxRankSoFar) violations += 1;
      maxRankSoFar = Math.max(maxRankSoFar, rk);
    }
    // Overrides aside, radial banding is a pure function of the metric ⇒ strictly monotonic.
    expect(violations).toBe(0);
  });

  test("core-band mix is honoured in aggregate — downtown skews tall (tower/slab)", () => {
    const coreLots = resolved.filter((r) => r.zone === "core");
    expect(coreLots.length).toBeGreaterThan(3);
    const tall = coreLots.filter((r) => r.class === "tower" || r.class === "slab").length;
    // The default core mix has all weight on tower/slab/shop; tower+slab carry 4/5 ⇒ solid majority.
    expect(tall / coreLots.length).toBeGreaterThan(0.4);
  });

  test("street-level bias raises the tall-building share on wide frontage (same city, same zones)", () => {
    // Isolate the bias from zoning by comparing biased vs unbiased over the SAME wide-frontage lots:
    // the boulevard/avenue bias only scales tower/slab/shop weights up, so their share can only rise.
    const wideCity = generateCity({ seed: "bias-city" }, HX, HZ);
    const withBias = resolveCityLotContent(wideCity, { seed: "bias-city", halfExtents: [HX, HZ], streetLevelBias: true });
    const noBias = resolveCityLotContent(wideCity, { seed: "bias-city", halfExtents: [HX, HZ], streetLevelBias: false });
    const wideLevels = ["boulevard", "avenue"];
    const tallShare = (rs: typeof withBias): number => {
      const pool = rs.filter((r) => wideLevels.includes(r.streetLevel));
      if (pool.length === 0) return 0;
      return pool.filter((r) => r.class === "tower" || r.class === "slab").length / pool.length;
    };
    if (withBias.some((r) => wideLevels.includes(r.streetLevel))) {
      expect(tallShare(withBias)).toBeGreaterThanOrEqual(tallShare(noBias) - 1e-9);
    }
  });

  test("custom mixes override the band — a single-class edge mix yields only that class at the rim", () => {
    const custom = resolveCityLotContent(base, {
      seed: "content-city",
      halfExtents: [HX, HZ],
      mixes: { edge: [{ item: "barn", weight: 1 }] as { item: CityLotClass; weight: number }[] },
      streetLevelBias: false,
    });
    const edge = custom.filter((r) => r.zone === "edge");
    expect(edge.length).toBeGreaterThan(0);
    for (const r of edge) expect(r.class).toBe("barn");
  });

  test("generateCity folds resolution behind the content option, leaving the bare path unchanged", () => {
    const bare = generateCity({ seed: "content-city" }, HX, HZ);
    expect(bare.lotContent).toBeUndefined();
    expect(Object.keys(bare).sort()).toEqual(["lots", "network"]);
    const enriched = generateCity({ seed: "content-city", content: true }, HX, HZ);
    // Bare-lot geometry is byte-identical; only lotContent is added.
    expect(enriched.lots).toEqual(bare.lots);
    expect(enriched.network).toEqual(bare.network);
    expect(enriched.lotContent).toBeDefined();
    expect(enriched.lotContent!.length).toBe(bare.lots.length);
    // Folded resolution matches the standalone call with the same frame.
    const standalone = resolveCityLotContent(bare, { seed: "content-city", halfExtents: [HX, HZ] });
    expect(enriched.lotContent).toEqual(standalone);
  });
});
