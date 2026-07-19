import { describe, expect, test } from "bun:test";
import {
  DEFAULT_BLOCK_FILL,
  DEFAULT_LANDMARK_SHARE,
  INTERIOR_LOTS_PER_BLOCK_CAP,
  LANDMARK_HARD_CAP,
  generateCity,
  resolveCityLotContent,
  type ResolvedCityLot,
} from "./cityGenerator";
import { CITY_FILLER_CLASSES, CITY_LANDMARK_CLASSES, CITY_LOT_CLASSES, type CityLandmarkClass, type CityLotClass } from "./cityContent";
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

describe("resolveCityLotContent — blockFill interior fill + parks", () => {
  const HX = 320;
  const HZ = 320;
  const SEED = "fill-city";
  const city = generateCity({ seed: SEED }, HX, HZ);
  const frame = { seed: SEED, halfExtents: [HX, HZ] as const };

  const dflt = resolveCityLotContent(city, frame); // default dial (0.45) — no fill
  const full = resolveCityLotContent(city, { ...frame, blockFill: 1 });
  const interiorsOf = (rs: readonly ResolvedCityLot[]) => rs.filter((r) => r.interior);
  const fillerSet = new Set<string>(CITY_FILLER_CLASSES);

  /** True if two placed lots' oriented rectangles overlap (SAT, touching allowed). */
  const overlaps = (a: ResolvedCityLot, b: ResolvedCityLot): boolean => {
    const box = (r: ResolvedCityLot) => {
      const w = r.landmark ? r.footprint.w : r.lot.footprint.w;
      const d = r.landmark ? r.footprint.d : r.lot.footprint.d;
      const c = Math.cos(r.rotationY);
      const s = Math.sin(r.rotationY);
      const pts = ([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]] as const).map(
        ([x, z]) => [r.center[0] + x * c - z * s, r.center[1] + x * s + z * c] as [number, number],
      );
      return { pts, axes: [[c, s], [-s, c]] as [number, number][] };
    };
    const A = box(a);
    const B = box(b);
    for (const [ax, az] of [...A.axes, ...B.axes]) {
      let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
      for (const [x, z] of A.pts) { const p = x * ax + z * az; amin = Math.min(amin, p); amax = Math.max(amax, p); }
      for (const [x, z] of B.pts) { const p = x * ax + z * az; bmin = Math.min(bmin, p); bmax = Math.max(bmax, p); }
      if (amax <= bmin + 1e-6 || bmax <= amin + 1e-6) return false; // separating axis
    }
    return true;
  };

  test("the default dial is a strict no-op: no interior lots, no park flags, backward-compatible", () => {
    expect(DEFAULT_BLOCK_FILL).toBeLessThan(0.5);
    expect(interiorsOf(dflt).length).toBe(0);
    expect(dflt.every((r) => r.park === undefined && r.interior === undefined)).toBe(true);
    // Omitting blockFill and passing the default explicitly agree.
    expect(resolveCityLotContent(city, { ...frame, blockFill: DEFAULT_BLOCK_FILL })).toEqual(dflt);
  });

  test("full fill packs block interiors — content count ≥ 1.6× the default for the same seed", () => {
    expect(interiorsOf(full).length).toBeGreaterThan(0);
    expect(full.length).toBeGreaterThanOrEqual(1.6 * dflt.length);
  });

  test("garage/depot fillers appear ONLY on interior-fill lots", () => {
    for (const r of full) {
      if (fillerSet.has(r.class)) expect(r.interior).toBe(true);
    }
    // And the interior pass actually reaches for them (not all interiors are ordinary classes).
    expect(interiorsOf(full).some((r) => fillerSet.has(r.class))).toBe(true);
  });

  test("no interior lot sits on a road", () => {
    for (const r of interiorsOf(full)) {
      const onRoad = city.network.streets.some((s) => isOnRoad(s.points, s.width, r.center[0], r.center[1]));
      expect(onRoad).toBe(false);
    }
  });

  test("no interior lot overlaps any other lot (frontage, landmark, or interior)", () => {
    const interior = interiorsOf(full);
    for (const it of interior) {
      for (const other of full) {
        if (other === it) continue;
        expect(overlaps(it, other)).toBe(false);
      }
    }
  });

  test("interior lots per block stay under the hard cap", () => {
    const perBlock = new Map<string, number>();
    for (const r of interiorsOf(full)) {
      const k = `${r.lot.road}:${r.lot.side}`;
      perBlock.set(k, (perBlock.get(k) ?? 0) + 1);
    }
    for (const n of perBlock.values()) expect(n).toBeLessThanOrEqual(INTERIOR_LOTS_PER_BLOCK_CAP);
  });

  test("park blocks are present and their interiors stay empty", () => {
    const parks = full.filter((r) => r.park);
    expect(parks.length).toBeGreaterThan(0); // a full-fill city still keeps breathing room
    const parkKeys = new Set(parks.map((r) => `${r.lot.road}:${r.lot.side}`));
    // No interior lot is ever attributed to a reserved park block.
    for (const r of interiorsOf(full)) expect(parkKeys.has(`${r.lot.road}:${r.lot.side}`)).toBe(false);
  });

  // Inter-lot gap fraction of the bare frontage lots on wide (avenue/boulevard) streets. Measured on
  // bare lots so landmark/park holes (which are filled, just not by a per-lot building) don't count.
  const frontageGapFraction = (c: ReturnType<typeof generateCity>): number => {
    const wide = new Set(["avenue", "boulevard"]);
    const frontage = c.network.streets.filter((s) => s.level !== "lane");
    const groups = new Map<string, { along: number; w: number }[]>();
    for (const lot of c.lots) {
      const st = frontage[lot.road];
      if (!st || !wide.has(st.level)) continue;
      const p0 = st.points[0]!;
      const p1 = st.points[st.points.length - 1]!;
      const tx = p1[0] - p0[0];
      const tz = p1[1] - p0[1];
      const L = Math.hypot(tx, tz) || 1;
      const along = ((lot.center[0] - p0[0]) * tx + (lot.center[1] - p0[1]) * tz) / L;
      const key = `${lot.road}:${lot.side}`;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push({ along, w: lot.footprint.w });
    }
    let totalGap = 0;
    let totalSpan = 0;
    for (const arr of groups.values()) {
      if (arr.length < 2) continue;
      arr.sort((a, b) => a.along - b.along);
      const span = arr[arr.length - 1]!.along - arr[0]!.along;
      if (span <= 0) continue;
      for (let i = 0; i + 1 < arr.length; i += 1) {
        const g = arr[i + 1]!.along - arr[i]!.along - (arr[i]!.w + arr[i + 1]!.w) / 2;
        if (g > 0) totalGap += g;
      }
      totalSpan += span;
    }
    return totalSpan > 0 ? totalGap / totalSpan : NaN;
  };

  test("full-fill frontage closes to a streetwall — inter-lot gap under 10%; low fill is sparser", () => {
    const fullCity = generateCity({ seed: SEED, lots: { blockFill: 1 } }, HX, HZ);
    const dfltCity = generateCity({ seed: SEED }, HX, HZ);
    const sparseCity = generateCity({ seed: SEED, lots: { blockFill: 0 } }, HX, HZ);
    const gFull = frontageGapFraction(fullCity);
    const gDflt = frontageGapFraction(dfltCity);
    const gSparse = frontageGapFraction(sparseCity);
    expect(gFull).toBeLessThan(0.1); // Manhattan streetwall
    expect(gFull).toBeLessThan(gDflt); // fuller than default
    expect(gSparse).toBeGreaterThan(gDflt); // low dial reads sparser than default
  });

  test("determinism: same seed + dial ⇒ identical result; landmarks still fire at full fill", () => {
    expect(resolveCityLotContent(city, { ...frame, blockFill: 1 })).toEqual(full);
    expect(full.some((r) => r.landmark !== undefined)).toBe(true);
  });

  test("generateCity threads content.blockFill into both the frontage compaction and the interior pass", () => {
    const compact = generateCity({ seed: SEED, content: { blockFill: 1 } }, HX, HZ);
    // Frontage lots compacted (more of them) AND interiors filled behind them.
    expect(compact.lots.length).toBeGreaterThan(city.lots.length);
    expect(compact.lotContent!.some((r) => r.interior)).toBe(true);
    // content:true (no dial) leaves the bare lots byte-identical to the no-content path.
    const bare = generateCity({ seed: SEED }, HX, HZ);
    const enriched = generateCity({ seed: SEED, content: true }, HX, HZ);
    expect(enriched.lots).toEqual(bare.lots);
    expect(enriched.lotContent!.every((r) => r.interior === undefined)).toBe(true);
  });
});
