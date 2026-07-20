import { describe, expect, test } from "bun:test";

import {
  generateStreets,
  clampTurns,
  streetNetworkMode,
  type StreetNetworkRules,
  type StreetVec2,
} from "./streetGenerator";

const BASE: StreetNetworkRules = {
  seed: "seed",
  gridness: 0.9,
  loopiness: 0.2,
  connectivity: 0.35,
  branching: 0.3,
  deadEnds: 0.5,
  segmentLength: 48,
  aspect: 1,
  winding: 0.2,
  minCurveRadius: 30,
  minTurnAngle: 0,
  maxTurnAngle: 120,
  width: 7,
  boulevards: 0.3,
};

function rules(overrides: Partial<StreetNetworkRules> = {}): StreetNetworkRules {
  return { ...BASE, ...overrides };
}

function turnDeg(a: StreetVec2, b: StreetVec2, c: StreetVec2): number {
  const ux = b[0] - a[0];
  const uz = b[1] - a[1];
  const vx = c[0] - b[0];
  const vz = c[1] - b[1];
  const lu = Math.hypot(ux, uz);
  const lv = Math.hypot(vx, vz);
  if (lu < 1e-6 || lv < 1e-6) return 0;
  const dot = (ux * vx + uz * vz) / (lu * lv);
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

describe("generateStreets determinism", () => {
  test("same rules + volume resolve identically", () => {
    const a = generateStreets(rules({ seed: "x" }), 240, 240);
    const b = generateStreets(rules({ seed: "x" }), 240, 240);
    expect(a).toEqual(b);
    expect(a.streets.length).toBeGreaterThan(0);
    expect(a.edges.length).toBeGreaterThan(0);
  });

  test("different seeds diverge", () => {
    const a = generateStreets(rules({ seed: "alpha" }), 240, 240);
    const b = generateStreets(rules({ seed: "beta" }), 240, 240);
    expect(JSON.stringify(a.edges)).not.toBe(JSON.stringify(b.edges));
  });
});

describe("topology mode", () => {
  test("circuit corner of the slider space picks circuit mode with a closed loop", () => {
    const r = rules({ loopiness: 1, branching: 0, connectivity: 0, winding: 0.4 });
    expect(streetNetworkMode(r)).toBe("circuit");
    const net = generateStreets(r, 240, 200);
    expect(net.mode).toBe("circuit");
    expect(net.loops).toBeGreaterThanOrEqual(1);
    const loop = net.streets.find((s) => s.loop);
    expect(loop).toBeDefined();
    const first = loop!.points[0]!;
    const last = loop!.points[loop!.points.length - 1]!;
    expect(Math.hypot(first[0] - last[0], first[1] - last[1])).toBeLessThan(1e-6);
  });

  test("city corner picks net mode", () => {
    const r = rules({ loopiness: 0.2, branching: 0.4, connectivity: 0.6 });
    expect(streetNetworkMode(r)).toBe("net");
    expect(generateStreets(r, 240, 240).mode).toBe("net");
  });

  test("net is fully connected — no orphan nodes", () => {
    const net = generateStreets(rules({ connectivity: 0.1, loopiness: 0.1 }), 240, 240);
    for (const node of net.nodes) expect(node.degree).toBeGreaterThanOrEqual(1);
  });
});

describe("geometry sliders", () => {
  test("gridness 1 + zero winding gives axis-aligned atomic edges", () => {
    const net = generateStreets(rules({ gridness: 1, winding: 0, branching: 0 }), 240, 240);
    for (const edge of net.edges) {
      const xs = edge.points.map((p) => p[0]);
      const zs = edge.points.map((p) => p[1]);
      const xSpread = Math.max(...xs) - Math.min(...xs);
      const zSpread = Math.max(...zs) - Math.min(...zs);
      expect(Math.min(xSpread, zSpread)).toBeLessThan(0.01);
    }
  });

  test("winding makes streets wander off-axis", () => {
    const net = generateStreets(rules({ gridness: 1, winding: 1, minCurveRadius: 8, maxTurnAngle: 170 }), 240, 240);
    const spreads = net.streets.map((s) => {
      const xs = s.points.map((p) => p[0]);
      const zs = s.points.map((p) => p[1]);
      return Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    });
    expect(Math.max(...spreads)).toBeGreaterThan(4);
  });

  test("maxTurnAngle is a hard ceiling on every street corner", () => {
    const net = generateStreets(rules({ winding: 1, minCurveRadius: 6, maxTurnAngle: 45, loopiness: 0.3 }), 260, 260);
    for (const street of net.streets) {
      for (let i = 1; i < street.points.length - 1; i += 1) {
        expect(turnDeg(street.points[i - 1]!, street.points[i]!, street.points[i + 1]!)).toBeLessThanOrEqual(46);
      }
    }
  });

  test("minTurnAngle straightens shallow wiggles before filleting", () => {
    // The straighten pass drops a sub-floor kink outright; a real corner survives as a fillet arc.
    const minRad = (15 * Math.PI) / 180;
    const dropped = clampTurns([[0, 0], [10, 0.6], [20, 0]], minRad, Math.PI);
    expect(dropped.length).toBe(2); // the ~6.8° kink is straightened away
    const kept = clampTurns([[0, 0], [10, 8], [20, 0]], minRad, (60 * Math.PI) / 180, 3);
    // A ~77° corner is preserved (rounded), never collapsed to a straight line.
    expect(kept.length).toBeGreaterThan(3);
    expect(kept[0]).toEqual([0, 0]);
    expect(kept[kept.length - 1]).toEqual([20, 0]);
  });
});

describe("arc-fillet corners (#1364)", () => {
  test("a sharp corner becomes a sampled arc, not a single bevel, honoring the radius", () => {
    const R = 12;
    const out = clampTurns([[0, 0], [40, 0], [40, 40]], 0, (30 * Math.PI) / 180, R, false);
    // More than the two points a bevel would insert — a real arc.
    const interior = out.slice(1, -1);
    expect(interior.length).toBeGreaterThan(3);
    // Endpoints welded.
    expect(out[0]).toEqual([0, 0]);
    expect(out[out.length - 1]).toEqual([40, 40]);
    // Every discrete turn stays under the ceiling.
    for (let i = 1; i < out.length - 1; i += 1) {
      expect(turnDeg(out[i - 1]!, out[i]!, out[i + 1]!)).toBeLessThanOrEqual(31);
    }
    // The arc's tangent point sits ~R·tan(45°) = R back from the 90° corner along each leg.
    expect(out[1]![0]).toBeCloseTo(40 - R, 0);
  });

  test("per-vertex discrete turn is bounded by maxTurnAngle across generated streets", () => {
    for (const seed of ["c1", "c2", "c3"]) {
      const net = generateStreets(rules({ seed, winding: 1, minCurveRadius: 10, maxTurnAngle: 40, loopiness: 0.4 }), 300, 260);
      for (const street of net.streets) {
        for (let i = 1; i < street.points.length - 1; i += 1) {
          expect(turnDeg(street.points[i - 1]!, street.points[i]!, street.points[i + 1]!)).toBeLessThanOrEqual(41);
        }
      }
    }
  });

  // Defect: round-1 fillets sampled so coarsely (up to ~28°/vertex on the playground circuit) that a
  // filleted corner rendered as a hard polygon and the ribbon extrusion self-intersected. Every arc
  // sample must now cap the per-vertex turn at ~9° (well under the looser maxTurnAngle ceiling), for
  // BOTH open street nets and closed circuit loops, wherever the corner had room for the fillet.
  test("filleted corners cap the per-vertex turn at ~10° even with a loose maxTurnAngle", () => {
    const cases: Partial<StreetNetworkRules>[] = [
      // The exact playground circuit rules the user measured (28° in round 1).
      { seed: "vice-isle", loopiness: 1, connectivity: 0, branching: 0, gridness: 0.5, segmentLength: 80, winding: 0.5, minCurveRadius: 24, maxTurnAngle: 120 },
      { seed: "vice-isle-2", loopiness: 1, connectivity: 0, branching: 0, winding: 0.6, minCurveRadius: 18, maxTurnAngle: 140 },
      // Open net with a wide ceiling — fillets must still self-cap the sample step.
      { seed: "net-wide", winding: 1, minCurveRadius: 20, maxTurnAngle: 160, loopiness: 0.3 },
      { seed: "net-wide-2", gridness: 0.4, winding: 0.8, minCurveRadius: 26, maxTurnAngle: 120, loopiness: 0.4 },
    ];
    for (const c of cases) {
      const hx = c.seed === "vice-isle" ? 260 : 260;
      const hz = c.seed === "vice-isle" ? 260 : 220;
      const net = generateStreets(rules(c), hx, hz);
      for (const street of net.streets) {
        for (let i = 1; i < street.points.length - 1; i += 1) {
          // 10° + epsilon: the arc step cap is 9°, plus a hair for float/rare no-room fallbacks.
          expect(turnDeg(street.points[i - 1]!, street.points[i]!, street.points[i + 1]!)).toBeLessThanOrEqual(10.5);
        }
      }
    }
  });

  test("a tight fillet with too-short legs is still sampled finely, not left near-sharp", () => {
    // Legs far shorter than the requested radius: the fillet shrinks to fit but must still be a curve
    // (many samples, each turn ≤ ~9°), never a single near-sharp bevel vertex.
    const R = 40; // much larger than the ~10-unit legs
    const out = clampTurns([[0, 0], [10, 0], [10, 10]], 0, (120 * Math.PI) / 180, R, false);
    expect(out.length).toBeGreaterThan(6); // finely sampled despite the leg clamp
    for (let i = 1; i < out.length - 1; i += 1) {
      expect(turnDeg(out[i - 1]!, out[i]!, out[i + 1]!)).toBeLessThanOrEqual(10.5);
    }
  });

  test("a closed loop stays welded (first === last) after filleting", () => {
    const ring: StreetVec2[] = [[0, 0], [40, 0], [40, 40], [0, 40], [0, 0]];
    const out = clampTurns(ring, 0, (30 * Math.PI) / 180, 8, true);
    const first = out[0]!;
    const last = out[out.length - 1]!;
    expect(Math.hypot(first[0] - last[0], first[1] - last[1])).toBeLessThan(1e-9);
    for (let i = 1; i < out.length - 1; i += 1) {
      expect(turnDeg(out[i - 1]!, out[i]!, out[i + 1]!)).toBeLessThanOrEqual(31);
    }
  });
});

describe("branching + dead ends", () => {
  test("branching adds lane-level streets; zero branching has none", () => {
    const none = generateStreets(rules({ seed: "b", branching: 0 }), 240, 240);
    const many = generateStreets(rules({ seed: "b", branching: 1 }), 240, 240);
    expect(none.streets.filter((s) => s.level === "lane").length).toBe(0);
    expect(many.streets.filter((s) => s.level === "lane").length).toBeGreaterThan(0);
  });

  test("keeping dead ends yields cul-de-sac bulbs", () => {
    const kept = generateStreets(rules({ seed: "d", branching: 0.8, deadEnds: 1, loopiness: 0 }), 240, 240);
    expect(kept.deadEnds.length).toBeGreaterThan(0);
    expect(kept.streets.some((s) => s.bulb !== undefined)).toBe(true);
  });
});

describe("footprint bounds", () => {
  test("all geometry stays inside the volume", () => {
    const net = generateStreets(rules({ winding: 1, gridness: 0, branching: 1, loopiness: 0.5, minCurveRadius: 6, maxTurnAngle: 170 }), 200, 160);
    for (const street of net.streets) {
      for (const [x, z] of street.points) {
        expect(Math.abs(x)).toBeLessThanOrEqual(200.5);
        expect(Math.abs(z)).toBeLessThanOrEqual(160.5);
      }
    }
  });
});

describe("bridges and tunnels", () => {
  // Volume half-extent 200 lays lattice nodes on multiples of 50; put each feature BETWEEN nodes so
  // a single street spans it with land banks on both sides.
  // A river trench across x in (15, 35) dips below the default min elevation.
  const river = (x: number): number => (x > 15 && x < 35 ? -8 : 2);
  // A ridge across x in (-85, -65) rises well above its banks.
  const ridge = (x: number): number => (x > -85 && x < -65 ? 20 : 2);

  test("a span diving under water becomes a bridge", () => {
    const net = generateStreets(rules({ gridness: 1, winding: 0, branching: 0 }), 200, 200, {
      heightAt: (x) => river(x),
      minElevation: -2,
      bridges: true,
    });
    expect(net.bridges.length).toBeGreaterThan(0);
    for (const bridge of net.bridges) {
      const first = bridge.points[0]!;
      const last = bridge.points[bridge.points.length - 1]!;
      expect(river(first[0])).toBeGreaterThanOrEqual(-2);
      expect(river(last[0])).toBeGreaterThanOrEqual(-2);
    }
  });

  test("a span buried under a ridge becomes a tunnel", () => {
    const net = generateStreets(rules({ gridness: 1, winding: 0, branching: 0 }), 200, 200, {
      heightAt: (x) => ridge(x),
      minElevation: -2,
      tunnels: true,
      tunnelClearance: 6,
    });
    expect(net.tunnels.length).toBeGreaterThan(0);
  });

  test("no features without a ground sampler", () => {
    const net = generateStreets(rules(), 200, 200);
    expect(net.bridges.length).toBe(0);
    expect(net.tunnels.length).toBe(0);
  });
});

describe("circuit synthesis (#1365)", () => {
  const circuitRules = (o: Partial<StreetNetworkRules> = {}) =>
    rules({ loopiness: 1, branching: 0, connectivity: 0, winding: 0.5, minCurveRadius: 14, maxTurnAngle: 120, ...o });

  // Reconstruct the closed centerline polygon from the single loop street.
  function loopPolygon(net: ReturnType<typeof generateStreets>): StreetVec2[] {
    const loop = net.streets.find((s) => s.loop);
    expect(loop).toBeDefined();
    const pts = loop!.points.slice(0, -1); // drop duplicated closing vertex
    return pts;
  }

  test("produces a self-clearing, non-star-shaped closed loop for several seeds", () => {
    for (const seed of ["r1", "r2", "r3", "r4", "r5"]) {
      const net = generateStreets(circuitRules({ seed }), 260, 220);
      expect(net.mode).toBe("circuit");
      const poly = loopPolygon(net);
      expect(poly.length).toBeGreaterThan(6);

      // Non-star-shaped: at least one reflex vertex (a star/convex blob has none).
      let area = 0;
      for (let i = 0; i < poly.length; i += 1) {
        const a = poly[i]!;
        const b = poly[(i + 1) % poly.length]!;
        area += a[0] * b[1] - b[0] * a[1];
      }
      const ccw = area > 0;
      let reflex = false;
      for (let i = 0; i < poly.length; i += 1) {
        const a = poly[(i - 1 + poly.length) % poly.length]!;
        const v = poly[i]!;
        const b = poly[(i + 1) % poly.length]!;
        const cross = (v[0] - a[0]) * (b[1] - v[1]) - (v[1] - a[1]) * (b[0] - v[0]);
        if ((ccw && cross < -1e-3) || (!ccw && cross > 1e-3)) reflex = true;
      }
      expect(reflex).toBe(true);

      // Self-clearing: parts of the loop FAR APART along the track (arc gap > gapMin) never fold to
      // within ~one track width of each other. Segments within a corner or between neighbors are
      // excluded (a hairpin's close legs are intentional).
      const width = net.streets.find((s) => s.loop)!.width;
      const clear = width * 0.9;
      const gapMin = width * 4;
      const n = poly.length;
      const seg: number[] = [];
      let perim = 0;
      for (let i = 0; i < n; i += 1) {
        const a = poly[i]!;
        const b = poly[(i + 1) % n]!;
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        seg.push(l);
        perim += l;
      }
      const cum = [0];
      for (let i = 0; i < n; i += 1) cum.push(cum[i]! + seg[i]!);
      const pointSeg = (p: StreetVec2, a: StreetVec2, c: StreetVec2): number => {
        const abx = c[0] - a[0];
        const abz = c[1] - a[1];
        const l2 = abx * abx + abz * abz;
        const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / l2));
        return Math.hypot(p[0] - (a[0] + abx * t), p[1] - (a[1] + abz * t));
      };
      for (let i = 0; i < n; i += 1) {
        const a1 = poly[i]!;
        const a2 = poly[(i + 1) % n]!;
        for (let j = i + 1; j < n; j += 1) {
          const arcGap = Math.min(cum[j]! - cum[i + 1]!, perim - cum[j + 1]! + cum[i]!);
          if (arcGap <= gapMin) continue;
          const b1 = poly[j]!;
          const b2 = poly[(j + 1) % n]!;
          const d = Math.min(pointSeg(a1, b1, b2), pointSeg(a2, b1, b2), pointSeg(b1, a1, a2), pointSeg(b2, a1, a2));
          expect(d).toBeGreaterThan(clear);
        }
      }
    }
  });

  test("guarantees at least one meaningful start/finish straight", () => {
    const net = generateStreets(circuitRules({ seed: "straight" }), 300, 260);
    const poly = loopPolygon(net);
    // Longest gap between direction changes ≥ 18% of the axis extent.
    let longest = 0;
    let run = 0;
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      const t = turnDeg(poly[(i - 1 + poly.length) % poly.length]!, a, b);
      run += Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (t > 6) {
        longest = Math.max(longest, run);
        run = 0;
      }
    }
    longest = Math.max(longest, run);
    expect(longest).toBeGreaterThanOrEqual(0.18 * 300 * 2 * 0.9 * 0.7);
  });

  test("pit lane leaves and rejoins the loop at two degree-3 junctions", () => {
    const net = generateStreets(circuitRules({ seed: "pit", branching: 0.6 }), 300, 260);
    // Two loop nodes with degree 3 (the pit entry/exit), plus a lane-level pit street.
    const deg3 = net.nodes.filter((n) => n.degree === 3);
    expect(deg3.length).toBe(2);
    expect(net.streets.some((s) => s.level === "lane")).toBe(true);
    // The pit lane is not a dead-end stub: no degree-1 node feeds it.
    expect(net.deadEnds.length).toBe(0);
  });

  test("determinism holds through the retry/synthesis path", () => {
    const a = generateStreets(circuitRules({ seed: "det" }), 260, 220);
    const b = generateStreets(circuitRules({ seed: "det" }), 260, 220);
    expect(a).toEqual(b);
  });
});

describe("curve-first circuit centerline (#1395)", () => {
  // The circuit centerline is a smooth closed spline whose curvature is FLOORED at minCurveRadius, not a
  // polygon filleted at its corners. A real lap is MOSTLY curve: continuous curvature (it flows), a legal
  // hairpin near the floor, a sustained sweeper several times the floor, and deliberate straights as the
  // exception — never straight chords joined by tiny corner caps.
  const circuitRules = (o: Partial<StreetNetworkRules> = {}) =>
    rules({ loopiness: 1, branching: 0, connectivity: 0, winding: 0.5, minCurveRadius: 14, maxTurnAngle: 120, ...o });
  const SEEDS = ["r1", "r2", "r3", "r4", "r5", "r6"];

  function circumradius(a: StreetVec2, b: StreetVec2, c: StreetVec2): number {
    const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
    const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    if (area < 1e-9) return Infinity;
    return (ab * bc * ca) / (4 * area);
  }

  // Per-sample loop metrics over the closed centerline: max turn, minimum fitted radius (the curvature
  // floor), curved-share (arc-length fraction perceptibly curved), max curvature JUMP outside straight
  // ends (the "flows, not corner-capped" property), presence of a near-hairpin and a sustained sweeper.
  function measure(net: ReturnType<typeof generateStreets>, minR: number) {
    const loop = net.streets.find((s) => s.loop)!;
    const p = loop.points.slice(0, -1);
    const n = p.length;
    const seg: number[] = [];
    let perim = 0;
    for (let i = 0; i < n; i += 1) {
      const l = Math.hypot(p[(i + 1) % n]![0] - p[i]![0], p[(i + 1) % n]![1] - p[i]![1]);
      seg.push(l);
      perim += l;
    }
    const turnAt = (i: number) => turnDeg(p[(i - 1 + n) % n]!, p[i]!, p[(i + 1) % n]!);
    const radAt = (i: number) => circumradius(p[(i - 1 + n) % n]!, p[i]!, p[(i + 1) % n]!);
    const localLen = (i: number) => (seg[(i - 1 + n) % n]! + seg[i]!) / 2;
    let maxTurn = 0;
    let minRad = Infinity;
    let curvedLen = 0;
    for (let i = 0; i < n; i += 1) {
      maxTurn = Math.max(maxTurn, turnAt(i));
      const R = radAt(i);
      if (Number.isFinite(R)) minRad = Math.min(minRad, R);
      if (R < 8 * minR) curvedLen += localLen(i);
    }
    // Curvature (1/R) jump between consecutive samples, EXCLUDING designated straight ends (a sample whose
    // own or next triple is near-straight, i.e. turn < 0.75°). This is the flow / no-corner-cap property.
    const kappa = (i: number) => {
      const R = radAt(i);
      return R > 1e6 ? 0 : 1 / R;
    };
    let maxJump = 0;
    for (let i = 0; i < n; i += 1) {
      if (turnAt(i) < 0.75 || turnDeg(p[i]!, p[(i + 1) % n]!, p[(i + 2) % n]!) < 0.75) continue;
      maxJump = Math.max(maxJump, Math.abs(kappa(i) - kappa((i + 1) % n)));
    }
    const hairpin = minRad <= 1.6 * minR;
    // Sustained sweeper: a run (≥25 m of arc) whose fitted radius stays in [4×, 40×] minR (40× excludes a
    // dead-straight run).
    let sweepRun = 0;
    let sustainedSweeper = false;
    for (let k = 0; k < 2 * n; k += 1) {
      const i = k % n;
      const R = radAt(i);
      if (R >= 4 * minR && R < 40 * minR) {
        sweepRun += seg[i]!;
        if (sweepRun >= 25) sustainedSweeper = true;
      } else {
        sweepRun = 0;
      }
    }
    return { maxTurn, minRad, curvedShare: curvedLen / perim, maxJump, hairpin, sustainedSweeper };
  }

  test("no discrete turn between consecutive samples exceeds 7° (6 seeds)", () => {
    for (const seed of SEEDS) {
      const m = measure(generateStreets(circuitRules({ seed }), 260, 220), 14);
      expect(m.maxTurn).toBeLessThanOrEqual(7 + 1e-6);
    }
  });

  test("the curvature floor holds: no sample triple fits a radius below minCurveRadius×0.92 (6 seeds)", () => {
    for (const seed of SEEDS) {
      const m = measure(generateStreets(circuitRules({ seed }), 260, 220), 14);
      expect(m.minRad).toBeGreaterThanOrEqual(14 * 0.92);
    }
  });

  test("curved-share: ≥50% of lap length is perceptibly curved (fitted R < 8×minR) for ≥4 of 6 seeds", () => {
    const shares = SEEDS.map((seed) => measure(generateStreets(circuitRules({ seed }), 260, 220), 14).curvedShare);
    expect(shares.filter((s) => s >= 0.5).length).toBeGreaterThanOrEqual(4);
  });

  test("curvature is CONTINUOUS: no sample-to-sample curvature jump > (1/minR)×0.5 outside straight ends", () => {
    for (const seed of SEEDS) {
      const m = measure(generateStreets(circuitRules({ seed }), 260, 220), 14);
      expect(m.maxJump).toBeLessThanOrEqual((0.5 / 14) + 1e-9);
    }
  });

  test("a near-hairpin (≤1.6×minR) AND a sustained sweeper (≥4×minR over ≥25 m) coexist for ≥4 of 6 seeds", () => {
    const results = SEEDS.map((seed) => measure(generateStreets(circuitRules({ seed }), 260, 220), 14));
    expect(results.filter((r) => r.hairpin && r.sustainedSweeper).length).toBeGreaterThanOrEqual(4);
  });

  test("the playground circuit rules read as a flowing, curve-first lap", () => {
    // seed vice-isle, the exact rules the orchestrator measures.
    const play = rules({ seed: "vice-isle", gridness: 0.5, loopiness: 1, connectivity: 0, branching: 0, segmentLength: 80, winding: 0.5, minCurveRadius: 24, maxTurnAngle: 120 });
    const m = measure(generateStreets(play, 260, 260), 24);
    expect(m.maxTurn).toBeLessThanOrEqual(7 + 1e-6);
    expect(m.minRad).toBeGreaterThanOrEqual(24 * 0.92);
    expect(m.curvedShare).toBeGreaterThanOrEqual(0.5);
    expect(m.maxJump).toBeLessThanOrEqual(0.5 / 24 + 1e-9);
    expect(m.hairpin).toBe(true);
    expect(m.sustainedSweeper).toBe(true);
  });
});

describe("structural hierarchy (#1368)", () => {
  test("arterial (avenue/boulevard) chains form a connected skeleton — no interior arterial dead-ends", () => {
    const net = generateStreets(rules({ seed: "art", connectivity: 0.5, loopiness: 0.3, branching: 0.2 }), 300, 300);
    const isArterial = (l: string) => l === "avenue" || l === "boulevard";
    expect(net.streets.some((s) => isArterial(s.level))).toBe(true);
    const deg = new Map(net.nodes.map((n) => [n.id, n.degree] as const));
    const rim = (id: number) => {
      const n = net.nodes.find((v) => v.id === id)!;
      return Math.abs(n.x) >= 300 - 0.5 || Math.abs(n.z) >= 300 - 0.5;
    };
    // For each arterial chain endpoint that is an interior junction, some other arterial must touch it.
    const arterialAt = new Map<number, number>();
    for (const s of net.streets) {
      if (!isArterial(s.level) || s.loop) continue;
      for (const end of [s.nodes[0]!, s.nodes[s.nodes.length - 1]!]) {
        arterialAt.set(end, (arterialAt.get(end) ?? 0) + 1);
      }
    }
    for (const s of net.streets) {
      if (!isArterial(s.level) || s.loop) continue;
      for (const end of [s.nodes[0]!, s.nodes[s.nodes.length - 1]!]) {
        if (rim(end)) continue;
        if ((deg.get(end) ?? 0) < 2) continue; // interior stubs asserted separately below
        expect(arterialAt.get(end)! >= 2).toBe(true);
      }
    }
  });

  test("no arterial ever dead-ends at an interior node — wide roads never stub out (#1454)", () => {
    for (const seed of ["art", "vice-isle", "stub-a", "stub-b", "stub-c"]) {
      const net = generateStreets(rules({ seed, deadEnds: 0.6, branching: 0.35 }), 300, 300);
      const deg = new Map(net.nodes.map((n) => [n.id, n.degree] as const));
      const byId = new Map(net.nodes.map((n) => [n.id, n] as const));
      const rim = (id: number) => {
        const n = byId.get(id)!;
        return Math.abs(n.x) >= 300 - 0.5 || Math.abs(n.z) >= 300 - 0.5;
      };
      for (const s of net.streets) {
        if ((s.level !== "avenue" && s.level !== "boulevard") || s.loop) continue;
        for (const end of [s.nodes[0]!, s.nodes[s.nodes.length - 1]!]) {
          expect((deg.get(end) ?? 0) >= 2 || rim(end)).toBe(true);
        }
      }
    }
  });
});

describe("planarity (#1454)", () => {
  test("no two edge chords cross without a shared node — every crossing is a junction", () => {
    const cross = (a: StreetVec2, b: StreetVec2, c: StreetVec2, d: StreetVec2): boolean => {
      const rx = b[0] - a[0];
      const rz = b[1] - a[1];
      const sx = d[0] - c[0];
      const sz = d[1] - c[1];
      const denom = rx * sz - rz * sx;
      if (Math.abs(denom) < 1e-9) return false;
      const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / denom;
      const u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / denom;
      const eps = 1e-3;
      return t > eps && t < 1 - eps && u > eps && u < 1 - eps;
    };
    // High branching + loopiness + low gridness exercises the chord-reconnect and spur paths hard.
    for (const seed of ["p1", "p2", "p3", "vice-isle"]) {
      const net = generateStreets(
        rules({ seed, branching: 0.8, loopiness: 0.6, deadEnds: 0.1, gridness: 0.3, connectivity: 0.7 }),
        300,
        300,
      );
      const pos = new Map(net.nodes.map((n) => [n.id, [n.x, n.z] as StreetVec2] as const));
      for (let i = 0; i < net.edges.length; i += 1) {
        for (let j = i + 1; j < net.edges.length; j += 1) {
          const e = net.edges[i]!;
          const f = net.edges[j]!;
          if (e.a === f.a || e.a === f.b || e.b === f.a || e.b === f.b) continue;
          expect(cross(pos.get(e.a)!, pos.get(e.b)!, pos.get(f.a)!, pos.get(f.b)!)).toBe(false);
        }
      }
    }
  });
});

describe("sidewalks (#1368)", () => {
  // Nearest distance from a point to a polyline (the centerline).
  function pointPolylineDist(px: number, pz: number, line: StreetVec2[]): number {
    let best = Infinity;
    for (let i = 0; i + 1 < line.length; i += 1) {
      const a = line[i]!;
      const b = line[i + 1]!;
      const abx = b[0] - a[0];
      const abz = b[1] - a[1];
      const l2 = abx * abx + abz * abz;
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * abx + (pz - a[1]) * abz) / l2));
      best = Math.min(best, Math.hypot(px - (a[0] + abx * t), pz - (a[1] + abz * t)));
    }
    return best;
  }
  function segCross(p1: StreetVec2, p2: StreetVec2, p3: StreetVec2, p4: StreetVec2): boolean {
    const d = (a: StreetVec2, b: StreetVec2, c: StreetVec2): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
    return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0);
  }

  test("straight paved streets carry parallel left/right bands offset by width/2 + sidewalkWidth", () => {
    const net = generateStreets(rules({ seed: "sw", winding: 0, gridness: 1, branching: 0.3, sidewalkWidth: 3 }), 240, 240);
    const paved = net.streets.filter((s) => s.level !== "lane");
    expect(paved.length).toBeGreaterThan(0);
    for (const s of paved) {
      expect(s.sidewalks).toBeDefined();
      // Sample a mid vertex: left and right sit ~width/2 + 3 off the centerline, on opposite sides.
      const want = s.width / 2 + 3;
      for (const band of [s.sidewalks!.left, s.sidewalks!.right]) {
        const i = Math.floor(band.length / 2);
        expect(pointPolylineDist(band[i]![0], band[i]![1], s.points)).toBeCloseTo(want, 5);
      }
    }
    // Lanes get no sidewalks.
    for (const s of net.streets.filter((s) => s.level === "lane")) {
      expect(s.sidewalks).toBeUndefined();
    }
  });

  // Defect: round-1 sidewalks were naive per-vertex normal offsets that, on inside corners, pinched and
  // swung INSIDE the road surface (same decal layer → z-fighting) and self-intersected. The offsetter
  // now welds pinched inside corners and arcs the outside, so every band vertex stays in a parallel
  // band clear of the road, and no consecutive band segments cross.
  test("sidewalk vertices stay in a parallel band clear of the road, with no self-intersections", () => {
    const configs: Partial<StreetNetworkRules>[] = [
      { seed: "sw-a", winding: 1, minCurveRadius: 8, maxTurnAngle: 150, sidewalkWidth: 3 },
      { seed: "sw-b", winding: 0.8, minCurveRadius: 6, maxTurnAngle: 170, sidewalkWidth: 2, gridness: 0.3 },
      { seed: "sw-c", winding: 1, minCurveRadius: 10, gridness: 0, branching: 1, loopiness: 0.5, sidewalkWidth: 2.5 },
    ];
    let checkedStreets = 0;
    for (const cfg of configs) {
      const sw = cfg.sidewalkWidth ?? 2;
      const net = generateStreets(rules(cfg), 260, 240);
      for (const s of net.streets) {
        if (!s.sidewalks) continue;
        checkedStreets += 1;
        const lower = s.width / 2 + sw * 0.45;
        const upper = s.width / 2 + sw * 1.6;
        for (const band of [s.sidewalks.left, s.sidewalks.right]) {
          for (const v of band) {
            const d = pointPolylineDist(v[0], v[1], s.points);
            expect(d).toBeGreaterThanOrEqual(lower);
            expect(d).toBeLessThanOrEqual(upper);
          }
          // No consecutive band segment pair crosses (and no local self-loop within a small window).
          for (let i = 0; i + 1 < band.length; i += 1) {
            for (let j = i + 2; j + 1 < band.length && j <= i + 6; j += 1) {
              expect(segCross(band[i]!, band[i + 1]!, band[j]!, band[j + 1]!)).toBe(false);
            }
          }
        }
      }
    }
    expect(checkedStreets).toBeGreaterThan(20);
  });
});

describe("circuit radius continuum (#1395)", () => {
  const circuitRules = (o: Partial<StreetNetworkRules> = {}) =>
    rules({ loopiness: 1, branching: 0, connectivity: 0, winding: 0.5, minCurveRadius: 14, maxTurnAngle: 120, ...o });
  const SEEDS = ["r1", "r2", "r3", "r4", "r5", "r6"];

  function circumradius(a: StreetVec2, b: StreetVec2, c: StreetVec2): number {
    const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
    const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    if (area < 1e-9) return Infinity;
    return (ab * bc * ca) / (4 * area);
  }
  // Radius of curvature at every sample of the closed loop that is genuinely curving (turn > 0.5°, so a
  // dead-straight run is excluded). The spline floors curvature at minR, so these span a CONTINUUM from
  // ~1×minR (hairpins) up to many ×minR (sweepers) — not three discrete fillet bands.
  function curvingRadii(loop: StreetVec2[]): number[] {
    const n = loop.length;
    const out: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const a = loop[(i - 1 + n) % n]!;
      const b = loop[i]!;
      const c = loop[(i + 1) % n]!;
      if (turnDeg(a, b, c) <= 0.5) continue;
      const r = circumradius(a, b, c);
      if (Number.isFinite(r)) out.push(r);
    }
    return out;
  }

  test("the fitted-radius continuum spans ~1×..≥4×minCurveRadius (tight hairpin to gentle sweeper), ≥4 of 6", () => {
    const minR = 14;
    let ok = 0;
    for (const seed of SEEDS) {
      const loop = generateStreets(circuitRules({ seed }), 260, 220).streets.find((s) => s.loop)!;
      const radii = curvingRadii(loop.points.slice(0, -1));
      if (radii.length < 8) continue;
      const tight = radii.some((r) => r <= 1.6 * minR); // hairpin band, at the floor
      const sweeper = radii.some((r) => r >= 4 * minR); // sweeper band, several × the floor
      if (tight && sweeper) ok += 1;
    }
    expect(ok).toBeGreaterThanOrEqual(4);
  });

  test("the radius spread is a real continuum — max ≫ min across the curving lap", () => {
    for (const seed of SEEDS) {
      const loop = generateStreets(circuitRules({ seed }), 260, 220).streets.find((s) => s.loop)!;
      const radii = curvingRadii(loop.points.slice(0, -1));
      if (radii.length < 8) continue;
      radii.sort((a, b) => a - b);
      // Robust percentiles avoid a single near-straight outlier; a genuine mix still opens the ratio wide.
      const lo = radii[Math.floor(radii.length * 0.05)]!;
      const hi = radii[Math.floor(radii.length * 0.95)]!;
      expect(hi / lo).toBeGreaterThan(2.5);
    }
  });

  test("the circuit centerline stays deterministic through the retry/synthesis path", () => {
    const a = generateStreets(circuitRules({ seed: "det-r" }), 260, 220);
    const b = generateStreets(circuitRules({ seed: "det-r" }), 260, 220);
    expect(a).toEqual(b);
  });
});

describe("elevation profile (#1395 round-3)", () => {
  test("elevation dial 0 is byte-identical to a pre-elevation network (regression guard)", () => {
    const flat = generateStreets(rules({ seed: "flat" }), 260, 260);
    const dialled = generateStreets(rules({ seed: "flat", elevation: 0 }), 260, 260);
    expect(JSON.stringify(flat)).toBe(JSON.stringify(dialled));
    expect(dialled.elevationAt).toBeUndefined();
    expect(dialled.streets.every((s) => s.heights === undefined)).toBe(true);
    expect(dialled.edges.every((e) => e.heights === undefined)).toBe(true);
  });

  test("elevation 0.6 attaches per-point heights, a shared field, and stays deterministic", () => {
    const r = rules({ seed: "hills", elevation: 0.6 });
    const a = generateStreets(r, 260, 260);
    const b = generateStreets(r, 260, 260);
    // toEqual would compare the elevationAt closures by reference; JSON drops functions, so compare the
    // serializable state and the field's samples separately.
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.elevationAt!(12, -47)).toBe(b.elevationAt!(12, -47));
    expect(a.elevationAt).toBeDefined();
    for (const s of a.streets) {
      expect(s.heights).toBeDefined();
      expect(s.heights!.length).toBe(s.points.length);
    }
    for (const e of a.edges) {
      expect(e.heights).toBeDefined();
      expect(e.heights!.length).toBe(e.points.length);
    }
    // Real relief present (not flat).
    const all = a.streets.flatMap((s) => s.heights!);
    expect(Math.max(...all) - Math.min(...all)).toBeGreaterThan(2);
    // Edges sample the SAME shared field (continuity for junction welds).
    for (const e of a.edges) {
      for (let i = 0; i < e.points.length; i += 1) {
        expect(e.heights![i]!).toBeCloseTo(a.elevationAt!(e.points[i]![0], e.points[i]![1]), 6);
      }
    }
  });

  test("street grade cap holds everywhere and respects a custom maxGrade", () => {
    for (const [elevation, maxGrade] of [[0.6, 0.07], [1, 0.04], [0.8, 0.1]] as const) {
      const net = generateStreets(rules({ seed: `grade-${maxGrade}`, elevation, maxGrade, winding: 0.6, loopiness: 0.4 }), 260, 240);
      for (const s of net.streets) {
        if (!s.heights) continue;
        for (let i = 1; i < s.points.length; i += 1) {
          const d = Math.hypot(s.points[i]![0] - s.points[i - 1]![0], s.points[i]![1] - s.points[i - 1]![1]);
          if (d < 1e-6) continue;
          expect(Math.abs(s.heights[i]! - s.heights[i - 1]!) / d).toBeLessThanOrEqual(maxGrade + 1e-6);
        }
      }
    }
  });

  test("a circuit lap's elevation is continuous across the start/finish seam and grade-capped", () => {
    const play = rules({ seed: "vice-isle", gridness: 0.5, loopiness: 1, connectivity: 0, branching: 0, segmentLength: 80, winding: 0.5, minCurveRadius: 24, maxTurnAngle: 120, elevation: 0.6 });
    const net = generateStreets(play, 260, 260);
    const loop = net.streets.find((s) => s.loop)!;
    const h = loop.heights!;
    // First === last around the closed lap.
    expect(Math.abs(h[0]! - h[h.length - 1]!)).toBeLessThan(1e-9);
    // Grade cap holds around the seam and everywhere on the lap.
    for (let i = 1; i < loop.points.length; i += 1) {
      const d = Math.hypot(loop.points[i]![0] - loop.points[i - 1]![0], loop.points[i]![1] - loop.points[i - 1]![1]);
      if (d < 1e-6) continue;
      expect(Math.abs(h[i]! - h[i - 1]!) / d).toBeLessThanOrEqual(0.07 + 1e-6);
    }
  });
});

describe("compactness — space-filling grid-cycle circuit (#1395 round-4)", () => {
  // The `compactness` dial swaps the circuit LAYOUT stage from the hull construction (a loop around an
  // empty middle) to a grid spanning-tree CYCLE that folds back through its own interior — parallel
  // corridors one pitch apart, switchback esses, consecutive hairpins, long straights — while every
  // downstream stage (spline fit, curvature floor, straights, clearance, edges, elevation, pit) is
  // reused. 0 stays byte-identical to the hull layout; rising values fill the footprint.
  const cRules = (o: Partial<StreetNetworkRules> = {}) =>
    rules({ loopiness: 1, branching: 0, connectivity: 0, winding: 0.5, minCurveRadius: 14, maxTurnAngle: 120, ...o });
  const SEEDS = ["r1", "r2", "r3", "r4", "r5", "r6"];

  // The grid corridor pitch (anti-parallel strand spacing / hairpin diameter), mirrored from the
  // generator's own `gridCorridorPitch`: max(2·trackWidth + 1.2·minR, 2.4·minR), trackWidth = width·1.5.
  const cellPitch = (r: StreetNetworkRules): number => {
    const tw = r.width * 1.5;
    const minR = Math.max(1, r.minCurveRadius);
    return Math.max(2 * tw + 1.2 * minR, 2.4 * minR);
  };
  function circumradius(a: StreetVec2, b: StreetVec2, c: StreetVec2): number {
    const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
    const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    if (area < 1e-9) return Infinity;
    return (ab * bc * ca) / (4 * area);
  }
  function segSeg(p1: StreetVec2, p2: StreetVec2, p3: StreetVec2, p4: StreetVec2): number {
    const ps = (p: StreetVec2, a: StreetVec2, b: StreetVec2): number => {
      const abx = b[0] - a[0];
      const abz = b[1] - a[1];
      const l2 = abx * abx + abz * abz;
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / l2));
      return Math.hypot(p[0] - (a[0] + abx * t), p[1] - (a[1] + abz * t));
    };
    return Math.min(ps(p1, p3, p4), ps(p2, p3, p4), ps(p3, p1, p2), ps(p4, p1, p2));
  }
  function loopOf(net: ReturnType<typeof generateStreets>): StreetVec2[] {
    const loop = net.streets.find((s) => s.loop)!;
    return loop.points.slice(0, -1);
  }
  // Space-filling metric: fraction of the loop bounding box within `reach` of the centerline. A folded,
  // interior-filling lap covers most of its box; a loop-around-an-empty-middle leaves the centre bare.
  function fillFraction(p: StreetVec2[], reach: number): number {
    const xs = p.map((q) => q[0]);
    const zs = p.map((q) => q[1]);
    const minx = Math.min(...xs);
    const maxx = Math.max(...xs);
    const minz = Math.min(...zs);
    const maxz = Math.max(...zs);
    const GR = 40;
    let near = 0;
    const n = p.length;
    for (let gi = 0; gi < GR; gi += 1) {
      for (let gj = 0; gj < GR; gj += 1) {
        const qx = minx + ((gi + 0.5) / GR) * (maxx - minx);
        const qz = minz + ((gj + 0.5) / GR) * (maxz - minz);
        let best = Infinity;
        for (let i = 0; i < n; i += 1) {
          const a = p[i]!;
          const b = p[(i + 1) % n]!;
          const abx = b[0] - a[0];
          const abz = b[1] - a[1];
          const l2 = abx * abx + abz * abz;
          const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((qx - a[0]) * abx + (qz - a[1]) * abz) / l2));
          const d = Math.hypot(qx - (a[0] + abx * t), qz - (a[1] + abz * t));
          if (d < best) best = d;
          if (best < reach) break;
        }
        if (best < reach) near += 1;
      }
    }
    return near / (GR * GR);
  }
  // Full loop metrics: corner count (maximal runs with fitted radius < 6·minR), floor, max turn, longest
  // near-straight run (radius ≥ 20·minR, a genuine straight), anti-parallel corridor pairs, min clearance.
  function measureLoop(net: ReturnType<typeof generateStreets>, r: StreetNetworkRules) {
    const p = loopOf(net);
    const n = p.length;
    const minR = r.minCurveRadius;
    const seg: number[] = [];
    let perim = 0;
    for (let i = 0; i < n; i += 1) {
      const l = Math.hypot(p[(i + 1) % n]![0] - p[i]![0], p[(i + 1) % n]![1] - p[i]![1]);
      seg.push(l);
      perim += l;
    }
    const rad = (i: number) => circumradius(p[(i - 1 + n) % n]!, p[i]!, p[(i + 1) % n]!);
    let corners = 0;
    let inC = false;
    let minRad = Infinity;
    let maxTurn = 0;
    for (let i = 0; i < n; i += 1) {
      const R = rad(i);
      if (R < 6 * minR) {
        if (!inC) corners += 1;
        inC = true;
      } else inC = false;
      if (Number.isFinite(R)) minRad = Math.min(minRad, R);
      maxTurn = Math.max(maxTurn, turnDeg(p[(i - 1 + n) % n]!, p[i]!, p[(i + 1) % n]!));
    }
    if (corners > 1 && rad(0) < 6 * minR && rad(n - 1) < 6 * minR) corners -= 1; // un-double the wrap
    let straight = 0;
    let run = 0;
    for (let k = 0; k < 2 * n; k += 1) {
      const i = k % n;
      if (rad(i) > 20 * minR) {
        run += seg[i]!;
        straight = Math.max(straight, run);
      } else run = 0;
    }
    // ~20 m anti-parallel corridor chunks within 2.2 pitches (dot < −0.9).
    const cp = cellPitch(r);
    const chunks: { dx: number; dz: number; mx: number; mz: number }[] = [];
    let acc = 0;
    let startI = 0;
    for (let i = 0; i < n; i += 1) {
      acc += seg[i]!;
      if (acc >= 20) {
        const a = p[startI]!;
        const b = p[(i + 1) % n]!;
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const l = Math.hypot(dx, dz) || 1;
        chunks.push({ dx: dx / l, dz: dz / l, mx: (a[0] + b[0]) / 2, mz: (a[1] + b[1]) / 2 });
        startI = (i + 1) % n;
        acc = 0;
      }
    }
    const seen = new Set<number>();
    let antipairs = 0;
    for (let i = 0; i < chunks.length; i += 1) {
      for (let j = i + 1; j < chunks.length; j += 1) {
        const A = chunks[i]!;
        const B = chunks[j]!;
        if (A.dx * B.dx + A.dz * B.dz < -0.9 && Math.hypot(A.mx - B.mx, A.mz - B.mz) < 2.2 * cp) {
          if (!seen.has(i) && !seen.has(j)) {
            antipairs += 1;
            seen.add(i);
            seen.add(j);
          }
        }
      }
    }
    return { corners, minRad, maxTurn, straightCp: straight / cp, antipairs, perim };
  }
  // The existing self-clearance check (far-apart segments never fold within one track width).
  function selfClearingHolds(net: ReturnType<typeof generateStreets>): boolean {
    const loop = net.streets.find((s) => s.loop)!;
    const p = loop.points.slice(0, -1);
    const clear = loop.width * 0.9;
    const gapMin = loop.width * 4;
    const n = p.length;
    const seg: number[] = [];
    let perim = 0;
    for (let i = 0; i < n; i += 1) {
      seg.push(Math.hypot(p[(i + 1) % n]![0] - p[i]![0], p[(i + 1) % n]![1] - p[i]![1]));
      perim += seg[i]!;
    }
    const cum = [0];
    for (let i = 0; i < n; i += 1) cum.push(cum[i]! + seg[i]!);
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const arcGap = Math.min(cum[j]! - cum[i + 1]!, perim - cum[j + 1]! + cum[i]!);
        if (arcGap <= gapMin) continue;
        if (segSeg(p[i]!, p[(i + 1) % n]!, p[j]!, p[(j + 1) % n]!) < clear) return false;
      }
    }
    return true;
  }

  // Compact generation runs the full dense centerline per retry (~1 s), so memoize deterministic nets and
  // reuse them across assertions; the determinism test below deliberately bypasses this cache.
  const cache = new Map<string, ReturnType<typeof generateStreets>>();
  const gen = (r: StreetNetworkRules, hx = 260, hz = 220): ReturnType<typeof generateStreets> => {
    const key = JSON.stringify([r, hx, hz]);
    let net = cache.get(key);
    if (net === undefined) {
      net = generateStreets(r, hx, hz);
      cache.set(key, net);
    }
    return net;
  };
  const T = 30000; // per-test timeout: several fresh compact generations

  test("compactness 0 is byte-identical to the default hull circuit (regression)", () => {
    for (const seed of ["r1", "r2", "vice-isle"]) {
      const hull = gen(cRules({ seed }), 260, 220);
      const dialled = gen(cRules({ seed, compactness: 0 }), 260, 220);
      expect(JSON.stringify(dialled)).toBe(JSON.stringify(hull));
    }
  }, T);

  test("compactness 1 folds ≥12 corners through the interior for ≥4 of 6 seeds", () => {
    const counts = SEEDS.map((seed) => measureLoop(gen(cRules({ seed, compactness: 1 }), 260, 220), cRules({ seed })).corners);
    expect(counts.filter((c) => c >= 12).length).toBeGreaterThanOrEqual(4);
  }, T);

  test("compactness 1 fills the interior far beyond the hull layout (space-filling metric)", () => {
    // Reach = 0.5·pitch: a folded lap covers most of its box; the hull loop leaves a bare middle.
    const compact = SEEDS.map((seed) => fillFraction(loopOf(gen(cRules({ seed, compactness: 1 }), 260, 220)), 0.5 * cellPitch(cRules())));
    const hull = SEEDS.map((seed) => fillFraction(loopOf(gen(cRules({ seed }), 260, 220)), 0.5 * cellPitch(cRules())));
    expect(compact.filter((f) => f >= 0.55).length).toBeGreaterThanOrEqual(4); // compact fills ≥55%
    for (const f of hull) expect(f).toBeLessThan(0.45); // hull leaves interior bare (measures ~0.30–0.36)
  }, T);

  test("compactness 1 runs parallel adjacent corridors — ≥3 anti-parallel segment pairs (6 seeds)", () => {
    for (const seed of SEEDS) {
      const r = cRules({ seed });
      expect(measureLoop(gen(cRules({ seed, compactness: 1 }), 260, 220), r).antipairs).toBeGreaterThanOrEqual(3);
    }
  }, T);

  test("the final compact spline stays self-clearing at compactness 0.5 and 1 (6 seeds)", () => {
    for (const seed of SEEDS) {
      expect(selfClearingHolds(gen(cRules({ seed, compactness: 0.5 }), 260, 220))).toBe(true);
      expect(selfClearingHolds(gen(cRules({ seed, compactness: 1 }), 260, 220))).toBe(true);
    }
  }, T);

  test("the curvature floor and ≤7° max turn hold on compact laps (0.5 and 1, 6 seeds)", () => {
    for (const seed of SEEDS) {
      for (const compactness of [0.5, 1]) {
        const r = cRules({ seed, compactness });
        const m = measureLoop(gen(r, 260, 220), r);
        expect(m.minRad).toBeGreaterThanOrEqual(14 * 0.92);
        expect(m.maxTurn).toBeLessThanOrEqual(7 + 1e-6);
      }
    }
  }, T);

  test("compactness 1 keeps a start/finish straight ≥ 3 corridor pitches for ≥4 of 6 seeds", () => {
    const straights = SEEDS.map((seed) => measureLoop(gen(cRules({ seed, compactness: 1 }), 260, 220), cRules({ seed })).straightCp);
    expect(straights.filter((s) => s >= 3).length).toBeGreaterThanOrEqual(4);
  }, T);

  test("a pit lane still attaches beside a compact start/finish straight (two degree-3 junctions)", () => {
    for (const compactness of [0.5, 1]) {
      const net = gen(cRules({ seed: "pit", compactness, branching: 0.6 }), 300, 260);
      expect(net.nodes.filter((n) => n.degree === 3).length).toBe(2);
      expect(net.streets.some((s) => s.level === "lane")).toBe(true);
      expect(net.deadEnds.length).toBe(0); // the pit rejoins the loop, never dangles
    }
  }, T);

  test("elevation drapes a compact lap continuously across the seam and stays grade-capped", () => {
    const net = gen(cRules({ seed: "r3", compactness: 1, elevation: 0.6 }), 260, 220);
    const loop = net.streets.find((s) => s.loop)!;
    const h = loop.heights!;
    expect(h.length).toBe(loop.points.length);
    expect(Math.abs(h[0]! - h[h.length - 1]!)).toBeLessThan(1e-9); // continuous at start/finish
    for (let i = 1; i < loop.points.length; i += 1) {
      const d = Math.hypot(loop.points[i]![0] - loop.points[i - 1]![0], loop.points[i]![1] - loop.points[i - 1]![1]);
      if (d < 1e-6) continue;
      expect(Math.abs(h[i]! - h[i - 1]!) / d).toBeLessThanOrEqual(0.07 + 1e-6);
    }
  }, T);

  test("compact layout is deterministic through the blob/tree/retry path", () => {
    const a = generateStreets(cRules({ seed: "det", compactness: 0.7 }), 260, 220);
    const b = generateStreets(cRules({ seed: "det", compactness: 0.7 }), 260, 220);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  }, T);

  test("the vice-isle playground reads as a space-filling compact lap at 0.5 and 1.0", () => {
    for (const compactness of [0.5, 1]) {
      const r = rules({ seed: "vice-isle", gridness: 0.5, loopiness: 1, connectivity: 0, branching: 0, segmentLength: 80, winding: 0.5, minCurveRadius: 24, maxTurnAngle: 120, compactness });
      const net = gen(r, 260, 260);
      const m = measureLoop(net, r);
      expect(net.mode).toBe("circuit");
      expect(m.minRad).toBeGreaterThanOrEqual(24 * 0.92); // curvature floor holds
      expect(m.maxTurn).toBeLessThanOrEqual(7 + 1e-6);
      expect(selfClearingHolds(net)).toBe(true);
      expect(fillFraction(loopOf(net), 0.5 * cellPitch(r))).toBeGreaterThanOrEqual(0.5);
    }
  }, T);
});

describe("clampTurns", () => {
  test("straightens a shallow kink and keeps endpoints", () => {
    const line: StreetVec2[] = [[0, 0], [10, 0.3], [20, 0]];
    const out = clampTurns(line, (10 * Math.PI) / 180, Math.PI);
    expect(out[0]).toEqual([0, 0]);
    expect(out[out.length - 1]).toEqual([20, 0]);
    expect(out.length).toBe(2); // the tiny bend is removed
  });

  test("bevels a hairpin below the ceiling", () => {
    const hairpin: StreetVec2[] = [[0, 0], [10, 0], [10.2, 10]];
    const maxRad = (60 * Math.PI) / 180;
    const out = clampTurns(hairpin, 0, maxRad);
    for (let i = 1; i < out.length - 1; i += 1) {
      const a = out[i - 1]!;
      const b = out[i]!;
      const c = out[i + 1]!;
      expect(turnDeg(a, b, c)).toBeLessThanOrEqual(61);
    }
  });
});
