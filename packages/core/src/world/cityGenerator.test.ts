import { describe, expect, test } from "bun:test";
import { DEFAULT_LANDMARK_SHARE, LANDMARK_HARD_CAP, generateCity, resolveCityLotContent, type ResolvedCityLot } from "./cityGenerator";
import { CITY_LANDMARK_CLASSES, CITY_LOT_CLASSES, type CityLandmarkClass, type CityLotClass } from "./cityContent";
import { rectClearsPolyline, rectsSeparated, type OrientedRect } from "./cityGeometry";
import { isOnRoad } from "./roads";

/** World-space oriented rect of a resolved building's massing bounds. */
function massingRect(entry: ResolvedCityLot): OrientedRect {
  const b = entry.footprint.bounds;
  const lx = (b.minX + b.maxX) / 2;
  const lz = (b.minZ + b.maxZ) / 2;
  const c = Math.cos(entry.rotationY);
  const s = Math.sin(entry.rotationY);
  return {
    x: entry.center[0] + lx * c + lz * s,
    z: entry.center[1] - lx * s + lz * c,
    hw: (b.maxX - b.minX) / 2,
    hd: (b.maxZ - b.minZ) / 2,
    angle: entry.rotationY,
  };
}

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
  // The base fixture pins the landmark pass OFF so the per-lot assertions below stay 1:1; the
  // landmark pass has its own describe block. `landmarks: 0` is also the backward-compat path.
  const resolved = resolveCityLotContent(base, { seed: "content-city", halfExtents: [HX, HZ], landmarks: 0 });

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
    const again = resolveCityLotContent(base, { seed: "content-city", halfExtents: [HX, HZ], landmarks: 0 });
    expect(again).toEqual(resolved);
    const other = resolveCityLotContent(base, { seed: "other-seed", halfExtents: [HX, HZ], landmarks: 0 });
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
    const withBias = resolveCityLotContent(wideCity, { seed: "bias-city", halfExtents: [HX, HZ], streetLevelBias: true, landmarks: 0 });
    const noBias = resolveCityLotContent(wideCity, { seed: "bias-city", halfExtents: [HX, HZ], streetLevelBias: false, landmarks: 0 });
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
      landmarks: 0,
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
    // The default landmark pass merges a few lots, so content count is ≤ lot count.
    expect(enriched.lotContent!.length).toBeLessThanOrEqual(bare.lots.length);
    expect(enriched.lotContent!.length).toBeGreaterThan(0);
    // Folded resolution matches the standalone call with the same frame (landmark pass and all).
    const standalone = resolveCityLotContent(bare, { seed: "content-city", halfExtents: [HX, HZ] });
    expect(enriched.lotContent).toEqual(standalone);
  });
});

describe("resolveCityLotContent — landmark pass", () => {
  const HX = 320;
  const HZ = 320;
  const city = generateCity({ seed: "landmark-city" }, HX, HZ);
  const frame = { seed: "landmark-city", halfExtents: [HX, HZ] as const };

  const landmarksOf = (rs: readonly { landmark?: CityLandmarkClass }[]) => rs.filter((r) => r.landmark !== undefined);
  const normalsOf = (rs: readonly { landmark?: CityLandmarkClass }[]) => rs.filter((r) => r.landmark === undefined);
  const median = (xs: number[]): number => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length === 0 ? 0 : s[Math.floor(s.length / 2)]!;
  };

  test("dial 0 places no landmarks and is 1:1 with the bare lots (backward-compat guard)", () => {
    const off = resolveCityLotContent(city, { ...frame, landmarks: 0 });
    expect(off.length).toBe(city.lots.length);
    off.forEach((r, i) => {
      expect(r.lot).toBe(city.lots[i]!);
      expect(r.landmark).toBeUndefined();
    });
    // Explicit 0 and the pre-landmark-shaped resolution agree — no landmark keys anywhere.
    expect(off.every((r) => r.landmark === undefined)).toBe(true);
  });

  test("the default dial (~0.04) yields a couple of landmarks; a fatter dial yields more", () => {
    const dfl = resolveCityLotContent(city, frame);
    const dflMarks = landmarksOf(dfl);
    expect(DEFAULT_LANDMARK_SHARE).toBeGreaterThan(0);
    expect(dflMarks.length).toBeGreaterThanOrEqual(1);
    expect(dflMarks.length).toBeLessThanOrEqual(LANDMARK_HARD_CAP);
    for (const r of dflMarks) expect(CITY_LANDMARK_CLASSES).toContain(r.landmark!);

    const fat = landmarksOf(resolveCityLotContent(city, { ...frame, landmarks: 0.2 }));
    expect(fat.length).toBeGreaterThan(dflMarks.length);
    expect(fat.length).toBeLessThanOrEqual(LANDMARK_HARD_CAP);
  });

  test("landmarks consume their member lots — no surviving normal lot center sits inside a landmark footprint", () => {
    const rs = resolveCityLotContent(city, { ...frame, landmarks: 0.2 });
    const marks = landmarksOf(rs);
    const normals = normalsOf(rs);
    expect(marks.length).toBeGreaterThan(0);
    for (const n of normals) {
      for (const lm of marks) {
        // Transform the normal lot's center into the landmark's local frame and reject containment.
        const dx = n.center[0] - lm.center[0];
        const dz = n.center[1] - lm.center[1];
        const c = Math.cos(lm.rotationY);
        const s = Math.sin(lm.rotationY);
        const lx = dx * c - dz * s;
        const lz = dx * s + dz * c;
        const b = lm.footprint.bounds;
        const inside = lx >= b.minX && lx <= b.maxX && lz >= b.minZ && lz <= b.maxZ;
        expect(inside).toBe(false);
      }
    }
  });

  test("each landmark footprint dwarfs the neighbourhood — area ≥ 3× the median normal lot area", () => {
    const rs = resolveCityLotContent(city, { ...frame, landmarks: 0.2 });
    const normalAreas = normalsOf(rs).map((r) => r.footprint.w * r.footprint.d);
    const med = median(normalAreas);
    expect(med).toBeGreaterThan(0);
    const marks = landmarksOf(rs);
    expect(marks.length).toBeGreaterThan(0);
    for (const lm of marks) {
      expect(lm.footprint.w * lm.footprint.d).toBeGreaterThanOrEqual(3 * med);
    }
  });

  test("same seed ⇒ identical landmarks; a new seed diverges", () => {
    const a = resolveCityLotContent(city, { ...frame, landmarks: 0.15 });
    const b = resolveCityLotContent(city, { ...frame, landmarks: 0.15 });
    expect(b).toEqual(a);
    const other = resolveCityLotContent(city, { seed: "other-landmarks", halfExtents: [HX, HZ], landmarks: 0.15 });
    const sig = (rs: typeof a) => landmarksOf(rs).map((r) => `${r.landmark}@${r.center[0].toFixed(1)},${r.center[1].toFixed(1)}`).join("|");
    expect(sig(other)).not.toBe(sig(a));
  });

  test("every landmark's massing pieces stay inside the reported footprint bounds", () => {
    const rs = resolveCityLotContent(city, { ...frame, landmarks: 0.2 });
    const marks = landmarksOf(rs) as import("./cityGenerator").ResolvedCityLot[];
    expect(marks.length).toBeGreaterThan(0);
    const eps = 1e-6;
    for (const lm of marks) {
      const { minX, maxX, minZ, maxZ } = lm.footprint.bounds;
      expect(lm.pieces.length).toBeGreaterThan(0);
      for (const piece of lm.pieces) {
        for (const v of [...piece.offset, ...piece.size]) expect(Number.isFinite(v)).toBe(true);
        for (const v of piece.size) expect(v).toBeGreaterThan(0);
        const c = Math.abs(Math.cos(piece.rotationY));
        const s = Math.abs(Math.sin(piece.rotationY));
        const hx = (piece.size[0] / 2) * c + (piece.size[2] / 2) * s;
        const hz = (piece.size[0] / 2) * s + (piece.size[2] / 2) * c;
        expect(piece.offset[0] - hx).toBeGreaterThanOrEqual(minX - eps);
        expect(piece.offset[0] + hx).toBeLessThanOrEqual(maxX + eps);
        expect(piece.offset[2] - hz).toBeGreaterThanOrEqual(minZ - eps);
        expect(piece.offset[2] + hz).toBeLessThanOrEqual(maxZ + eps);
      }
    }
  });

  test("landmarkClasses restricts the pass to the allowed set", () => {
    const rs = resolveCityLotContent(city, { ...frame, landmarks: 0.25, landmarkClasses: ["arena"] });
    const marks = landmarksOf(rs);
    expect(marks.length).toBeGreaterThan(0);
    for (const r of marks) expect(r.landmark).toBe("arena");
  });
});

describe("plot contract (#1454)", () => {
  // The playground's default dials — the exact configuration the overlap bugs shipped in.
  const seeds = ["vice-isle", "neon-harbor-42", "plot-a"];
  const cities = seeds.map((seed) =>
    generateCity(
      { seed, lots: { footprint: { w: 12, d: 10 }, setback: 3 }, content: { landmarks: 0.06 } },
      260,
      260,
    ),
  );

  test("no two plots overlap — any road pair, any side, corners and curves included", () => {
    for (const city of cities) {
      const rects: OrientedRect[] = city.lots.map((lot) => ({
        x: lot.center[0],
        z: lot.center[1],
        hw: lot.footprint.w / 2 - 0.05,
        hd: lot.footprint.d / 2 - 0.05,
        angle: lot.rotationY,
      }));
      for (let i = 0; i < rects.length; i += 1) {
        for (let j = i + 1; j < rects.length; j += 1) {
          expect(rectsSeparated(rects[i]!, rects[j]!)).toBe(true);
        }
      }
    }
  });

  test("no plot footprint touches any street corridor (lanes included)", () => {
    for (const city of cities) {
      for (const lot of city.lots) {
        const rect: OrientedRect = {
          x: lot.center[0],
          z: lot.center[1],
          hw: lot.footprint.w / 2,
          hd: lot.footprint.d / 2,
          angle: lot.rotationY,
        };
        for (const street of city.network.streets) {
          expect(rectClearsPolyline(rect, street.points, street.width / 2 - 0.1)).toBe(true);
        }
      }
    }
  });

  test("every resolved massing fits its plot — classes never outgrow the frontage spacing", () => {
    for (const city of cities) {
      for (const entry of city.lotContent!) {
        if (entry.landmark !== undefined) continue; // landmarks legitimately span merged plots
        expect(entry.footprint.w).toBeLessThanOrEqual(entry.lot.footprint.w + 1e-6);
        expect(entry.footprint.d).toBeLessThanOrEqual(entry.lot.footprint.d + 1e-6);
        const b = entry.footprint.bounds;
        expect(Math.max(Math.abs(b.minX), Math.abs(b.maxX))).toBeLessThanOrEqual(entry.lot.footprint.w / 2 + 1e-6);
        expect(Math.max(Math.abs(b.minZ), Math.abs(b.maxZ))).toBeLessThanOrEqual(entry.lot.footprint.d / 2 + 1e-6);
      }
    }
  });

  test("no two resolved buildings overlap — landmarks included", () => {
    for (const city of cities) {
      const rects = city.lotContent!.map((entry) => {
        const r = massingRect(entry);
        return { ...r, hw: Math.max(0.1, r.hw - 0.05), hd: Math.max(0.1, r.hd - 0.05) };
      });
      for (let i = 0; i < rects.length; i += 1) {
        for (let j = i + 1; j < rects.length; j += 1) {
          expect(rectsSeparated(rects[i]!, rects[j]!)).toBe(true);
        }
      }
    }
  });

  test("no resolved building (landmarks included) intrudes into any street corridor", () => {
    for (const city of cities) {
      for (const entry of city.lotContent!) {
        const rect = massingRect(entry);
        for (const street of city.network.streets) {
          expect(rectClearsPolyline(rect, street.points, street.width / 2 - 0.1)).toBe(true);
        }
      }
    }
  });
});
