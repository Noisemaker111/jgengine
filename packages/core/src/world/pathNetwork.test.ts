import { describe, expect, test } from "bun:test";

import {
  buildPathNetwork,
  clampTurns,
  pathNetworkMode,
  type PathNetworkRules,
  type PathVec2,
} from "./pathNetwork";

const BASE: PathNetworkRules = {
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

function rules(overrides: Partial<PathNetworkRules> = {}): PathNetworkRules {
  return { ...BASE, ...overrides };
}

function turnDeg(a: PathVec2, b: PathVec2, c: PathVec2): number {
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

describe("buildPathNetwork determinism", () => {
  test("same rules + volume resolve identically", () => {
    const a = buildPathNetwork(rules({ seed: "x" }), 240, 240);
    const b = buildPathNetwork(rules({ seed: "x" }), 240, 240);
    expect(a).toEqual(b);
    expect(a.streets.length).toBeGreaterThan(0);
    expect(a.edges.length).toBeGreaterThan(0);
  });

  test("different seeds diverge", () => {
    const a = buildPathNetwork(rules({ seed: "alpha" }), 240, 240);
    const b = buildPathNetwork(rules({ seed: "beta" }), 240, 240);
    expect(JSON.stringify(a.edges)).not.toBe(JSON.stringify(b.edges));
  });
});

describe("topology mode", () => {
  test("circuit corner of the slider space picks circuit mode with a closed loop", () => {
    const r = rules({ loopiness: 1, branching: 0, connectivity: 0, winding: 0.4 });
    expect(pathNetworkMode(r)).toBe("circuit");
    const net = buildPathNetwork(r, 240, 200);
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
    expect(pathNetworkMode(r)).toBe("net");
    expect(buildPathNetwork(r, 240, 240).mode).toBe("net");
  });

  test("net is fully connected — no orphan nodes", () => {
    const net = buildPathNetwork(rules({ connectivity: 0.1, loopiness: 0.1 }), 240, 240);
    for (const node of net.nodes) expect(node.degree).toBeGreaterThanOrEqual(1);
  });
});

describe("geometry sliders", () => {
  test("gridness 1 + zero winding gives axis-aligned atomic edges", () => {
    const net = buildPathNetwork(rules({ gridness: 1, winding: 0, branching: 0 }), 240, 240);
    for (const edge of net.edges) {
      const xs = edge.points.map((p) => p[0]);
      const zs = edge.points.map((p) => p[1]);
      const xSpread = Math.max(...xs) - Math.min(...xs);
      const zSpread = Math.max(...zs) - Math.min(...zs);
      expect(Math.min(xSpread, zSpread)).toBeLessThan(0.01);
    }
  });

  test("winding makes streets wander off-axis", () => {
    const net = buildPathNetwork(rules({ gridness: 1, winding: 1, minCurveRadius: 8, maxTurnAngle: 170 }), 240, 240);
    const spreads = net.streets.map((s) => {
      const xs = s.points.map((p) => p[0]);
      const zs = s.points.map((p) => p[1]);
      return Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    });
    expect(Math.max(...spreads)).toBeGreaterThan(4);
  });

  test("maxTurnAngle is a hard ceiling on every street corner", () => {
    const net = buildPathNetwork(rules({ winding: 1, minCurveRadius: 6, maxTurnAngle: 45, loopiness: 0.3 }), 260, 260);
    for (const street of net.streets) {
      for (let i = 1; i < street.points.length - 1; i += 1) {
        expect(turnDeg(street.points[i - 1]!, street.points[i]!, street.points[i + 1]!)).toBeLessThanOrEqual(46);
      }
    }
  });

  test("minTurnAngle straightens shallow wiggles", () => {
    const net = buildPathNetwork(rules({ winding: 0.6, minTurnAngle: 15, maxTurnAngle: 160 }), 260, 260);
    for (const street of net.streets) {
      for (let i = 1; i < street.points.length - 1; i += 1) {
        const t = turnDeg(street.points[i - 1]!, street.points[i]!, street.points[i + 1]!);
        // Either straight-through (below tolerance) or a deliberate corner at/above the floor.
        expect(t < 0.5 || t >= 14).toBe(true);
      }
    }
  });
});

describe("branching + dead ends", () => {
  test("branching adds lane-level streets; zero branching has none", () => {
    const none = buildPathNetwork(rules({ seed: "b", branching: 0 }), 240, 240);
    const many = buildPathNetwork(rules({ seed: "b", branching: 1 }), 240, 240);
    expect(none.streets.filter((s) => s.level === "lane").length).toBe(0);
    expect(many.streets.filter((s) => s.level === "lane").length).toBeGreaterThan(0);
  });

  test("keeping dead ends yields cul-de-sac bulbs", () => {
    const kept = buildPathNetwork(rules({ seed: "d", branching: 0.8, deadEnds: 1, loopiness: 0 }), 240, 240);
    expect(kept.deadEnds.length).toBeGreaterThan(0);
    expect(kept.streets.some((s) => s.bulb !== undefined)).toBe(true);
  });
});

describe("footprint bounds", () => {
  test("all geometry stays inside the volume", () => {
    const net = buildPathNetwork(rules({ winding: 1, gridness: 0, branching: 1, loopiness: 0.5, minCurveRadius: 6, maxTurnAngle: 170 }), 200, 160);
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
    const net = buildPathNetwork(rules({ gridness: 1, winding: 0, branching: 0 }), 200, 200, {
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
    const net = buildPathNetwork(rules({ gridness: 1, winding: 0, branching: 0 }), 200, 200, {
      heightAt: (x) => ridge(x),
      minElevation: -2,
      tunnels: true,
      tunnelClearance: 6,
    });
    expect(net.tunnels.length).toBeGreaterThan(0);
  });

  test("no features without a ground sampler", () => {
    const net = buildPathNetwork(rules(), 200, 200);
    expect(net.bridges.length).toBe(0);
    expect(net.tunnels.length).toBe(0);
  });
});

describe("clampTurns", () => {
  test("straightens a shallow kink and keeps endpoints", () => {
    const line: PathVec2[] = [[0, 0], [10, 0.3], [20, 0]];
    const out = clampTurns(line, (10 * Math.PI) / 180, Math.PI);
    expect(out[0]).toEqual([0, 0]);
    expect(out[out.length - 1]).toEqual([20, 0]);
    expect(out.length).toBe(2); // the tiny bend is removed
  });

  test("bevels a hairpin below the ceiling", () => {
    const hairpin: PathVec2[] = [[0, 0], [10, 0], [10.2, 10]];
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
