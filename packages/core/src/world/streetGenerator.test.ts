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
        if ((deg.get(end) ?? 0) < 2) continue; // cul-de-sac terminus is allowed
        expect(arterialAt.get(end)! >= 2).toBe(true);
      }
    }
  });
});

describe("sidewalks (#1368)", () => {
  test("paved streets carry parallel left/right bands offset by width/2 + sidewalkWidth", () => {
    const net = generateStreets(rules({ seed: "sw", winding: 0, gridness: 1, branching: 0.3, sidewalkWidth: 3 }), 240, 240);
    const paved = net.streets.filter((s) => s.level !== "lane");
    expect(paved.length).toBeGreaterThan(0);
    for (const s of paved) {
      expect(s.sidewalks).toBeDefined();
      expect(s.sidewalks!.left.length).toBe(s.points.length);
      expect(s.sidewalks!.right.length).toBe(s.points.length);
      // Sample a mid vertex: left and right sit ~width/2 + 3 off the centerline, on opposite sides.
      const want = s.width / 2 + 3;
      const i = Math.floor(s.points.length / 2);
      const c = s.points[i]!;
      const dl = Math.hypot(s.sidewalks!.left[i]![0] - c[0], s.sidewalks!.left[i]![1] - c[1]);
      const dr = Math.hypot(s.sidewalks!.right[i]![0] - c[0], s.sidewalks!.right[i]![1] - c[1]);
      expect(dl).toBeCloseTo(want, 5);
      expect(dr).toBeCloseTo(want, 5);
    }
    // Lanes get no sidewalks.
    for (const s of net.streets.filter((s) => s.level === "lane")) {
      expect(s.sidewalks).toBeUndefined();
    }
  });
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
