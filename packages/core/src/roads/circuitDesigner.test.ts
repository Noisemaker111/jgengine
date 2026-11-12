import { describe, expect, test } from "bun:test";

import { runGenerator } from "../generator/generator";
import { lapTimeProfile } from "./circuitDressing";
import { RACE_CIRCUIT_GENERATOR, RACE_CIRCUIT_SCHEMA, type CircuitRoute, type RaceCircuit } from "./raceCircuit";
import type { StreetVec2 } from "./streetGenerator";

// Quality gates for designed closed circuits, measured off the finished lap geometry the way the
// generator audit measures them (radius through the points ±10 m away), per character preset over ten
// seeds: R p10 ≤ 15 m and p90 ≥ 120 m, ≥ 2 long straights, ≥ 1 overtaking spot, 3–6 corners/km, lap length
// within 10%, no grid slot in a corner, a pit lane joined to the lap with nothing across it, no
// self-intersection and no near-parallel stretch inside a safe gap.

const CLOSED = (RACE_CIRCUIT_SCHEMA.presets ?? []).filter((preset) => preset.id !== "street-race");
const SEEDS = ["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9"];
/** A volume that holds every preset's lap. */
const HALF_X = 1000;
const HALF_Z = 750;

const cache = new Map<string, RaceCircuit>();
function race(presetId: string, seed: string, overrides: Record<string, unknown> = {}): RaceCircuit {
  const key = `${presetId}:${seed}:${JSON.stringify(overrides)}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const preset = CLOSED.find((p) => p.id === presetId)!;
  const made = runGenerator(RACE_CIRCUIT_GENERATOR, { ...preset.values, halfX: HALF_X, halfZ: HALF_Z, seed, ...overrides });
  cache.set(key, made);
  return made;
}

function circumradius(a: StreetVec2, b: StreetVec2, c: StreetVec2): number {
  const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
  const ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
  const cross = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  return cross < 1e-9 ? Infinity : (ab * bc * ca) / (2 * cross);
}

/** Radius at every point through the points `span` metres either side (the audit's measure). */
function radii(route: CircuitRoute, span = 10): number[] {
  const pts = route.centerline;
  const n = pts.length;
  const step = Math.max(1, Math.round(span / (route.length / n)));
  return pts.map((_, i) => circumradius(pts[(i - step + n) % n]!, pts[i]!, pts[(i + step) % n]!));
}

function quantile(values: number[], q: number): number {
  const s = [...values].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return s[lo]! + (s[hi]! - s[lo]!) * (i - lo);
}

/** Straight runs (R > 250 m), as [start index, length] pairs, measured whole across the seam. */
function straightRuns(route: CircuitRoute): { start: number; end: number; length: number }[] {
  const R = radii(route);
  const n = R.length;
  const step = route.length / n;
  const origin = R.findIndex((r) => r <= 250);
  const runs: { start: number; end: number; length: number }[] = [];
  let k = 0;
  while (k < n) {
    const i = (origin + k) % n;
    if (R[i]! <= 250) {
      k += 1;
      continue;
    }
    let len = 0;
    while (len < n && R[(origin + k + len) % n]! > 250) len += 1;
    runs.push({ start: i, end: (i + len) % n, length: len * step });
    k += len;
  }
  return runs;
}

/** Scale-appropriate long straight: 400 m, or 15% of a short lap. */
const longStraight = (lap: number): number => Math.min(400, 0.15 * lap);

function overtakingSpots(route: CircuitRoute): number {
  const R = radii(route);
  const n = R.length;
  const step = route.length / n;
  return straightRuns(route).filter((run) => {
    if (run.length < longStraight(route.length)) return false;
    for (let k = 0; k * step <= 60; k += 1) if (R[(run.end + k) % n]! < 40) return true;
    return false;
  }).length;
}

function segmentsCross(a: StreetVec2, b: StreetVec2, c: StreetVec2, d: StreetVec2): boolean {
  const rx = b[0] - a[0];
  const ry = b[1] - a[1];
  const sx = d[0] - c[0];
  const sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return false;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den;
  const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9;
}

/** Every pair of crossing centerline segments (i < j, non-adjacent). */
function selfCrossings(points: readonly StreetVec2[]): [number, number][] {
  const n = points.length;
  const found: [number, number][] = [];
  for (let i = 0; i < n; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    for (let j = i + 2; j < n; j += 1) {
      if (i === 0 && j === n - 1) continue;
      const c = points[j]!;
      if (Math.abs(c[0] - a[0]) > 40 || Math.abs(c[1] - a[1]) > 40) continue;
      if (segmentsCross(a, b, c, points[(j + 1) % n]!)) found.push([i, j]);
    }
  }
  return found;
}

describe.each(CLOSED.map((preset) => preset.id))("closed circuit preset %s over ten seeds", (id) => {
  const routes = (): CircuitRoute[] => SEEDS.map((seed) => race(id, seed).route!);

  test("designs a lap for every seed, at the requested length (±10%)", () => {
    const lap = Number(CLOSED.find((p) => p.id === id)!.values.lapLength);
    for (const [k, route] of routes().entries()) {
      expect(route, `${id}:${SEEDS[k]}`).not.toBeNull();
      expect(Math.abs(route.length - lap) / lap, `${id}:${SEEDS[k]} lap ${route.length}`).toBeLessThanOrEqual(0.1);
    }
  }, 60_000);

  test("corner radii span hairpins to fast sweepers: p10 ≤ 15 m, p90 ≥ 120 m", () => {
    for (const [k, route] of routes().entries()) {
      const r = route.corners.map((corner) => corner.radius);
      expect(quantile(r, 0.1), `${id}:${SEEDS[k]}`).toBeLessThanOrEqual(15);
      expect(quantile(r, 0.9), `${id}:${SEEDS[k]}`).toBeGreaterThanOrEqual(120);
    }
  }, 60_000);

  test("3–6 corners per km, of at least three kinds", () => {
    for (const [k, route] of routes().entries()) {
      const perKm = route.corners.length / (route.length / 1000);
      expect(perKm, `${id}:${SEEDS[k]}`).toBeGreaterThanOrEqual(3);
      expect(perKm, `${id}:${SEEDS[k]}`).toBeLessThanOrEqual(6);
      expect(new Set(route.corners.map((corner) => corner.kind)).size, `${id}:${SEEDS[k]}`).toBeGreaterThanOrEqual(3);
    }
  }, 60_000);

  test("at least two long straights, and at least one ends in a heavy-braking overtaking spot", () => {
    for (const [k, route] of routes().entries()) {
      const long = straightRuns(route).filter((run) => run.length >= longStraight(route.length));
      expect(long.length, `${id}:${SEEDS[k]}`).toBeGreaterThanOrEqual(2);
      expect(overtakingSpots(route), `${id}:${SEEDS[k]}`).toBeGreaterThanOrEqual(1);
    }
  }, 60_000);

  test("the whole grid stands on the start straight, none of it in a corner", () => {
    for (const [k, route] of routes().entries()) {
      const R = radii(route);
      expect(route.grid.length).toBe(20);
      for (const slot of route.grid) {
        let best = 0;
        let bestD = Infinity;
        route.centerline.forEach((p, i) => {
          const d = Math.hypot(p[0] - slot.x, p[1] - slot.z);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        });
        expect(R[best]!, `${id}:${SEEDS[k]}`).toBeGreaterThanOrEqual(150);
      }
    }
  }, 60_000);

  test("the pit lane is part of the event: joined at both ends, nothing built across it", () => {
    for (const [k, seed] of SEEDS.entries()) {
      const { network, route } = race(id, seed);
      const pit = route!.pit;
      expect(pit, `${id}:${SEEDS[k]}`).toBeDefined();
      const pts = pit!.points;
      const onLap = (p: StreetVec2): number => Math.min(...route!.centerline.map((c) => Math.hypot(c[0] - p[0], c[1] - p[1])));
      expect(onLap(pts[0]!)).toBeLessThan(1.5);
      expect(onLap(pts[pts.length - 1]!)).toBeLessThan(1.5);
      // The pit lane joins the lap at two degree-3 junctions and is never sealed off.
      expect(network.nodes.filter((node) => node.degree === 3).length).toBe(2);
      expect(network.deadEnds.length).toBe(0);
      expect(route!.seals.length).toBe(0);
      // No barrier, tyre wall or run-off strip crosses the pit lane.
      for (const run of [...(route!.walls ?? []), ...(route!.runoff ?? [])]) {
        for (let i = 0; i + 1 < run.points.length; i += 1) {
          for (let j = 0; j + 1 < pts.length; j += 1) {
            expect(segmentsCross(run.points[i]!, run.points[i + 1]!, pts[j]!, pts[j + 1]!), `${id}:${seed}`).toBe(false);
          }
        }
      }
      expect(pit!.garages.length).toBeGreaterThan(4);
    }
  }, 60_000);

  test("never runs through itself or alongside itself inside a safe gap (one grade-separated crossing for a figure-8)", () => {
    const figure8 = CLOSED.find((p) => p.id === id)!.values.crossover === true;
    for (const [k, route] of routes().entries()) {
      const crossings = selfCrossings(route.centerline);
      expect(crossings.length, `${id}:${SEEDS[k]}`).toBe(figure8 ? 1 : 0);
      const pts = route.centerline;
      const n = pts.length;
      const step = route.length / n;
      const cross = figure8 ? route.crossings![0]! : null;
      if (cross !== null) expect(cross.overHeight - cross.underHeight).toBeGreaterThanOrEqual(7);
      for (let i = 0; i < n; i += 2) {
        for (let j = i + 2; j < n; j += 2) {
          const arc = Math.min((j - i) * step, route.length - (j - i) * step);
          if (arc < 160) continue;
          const a = pts[i]!;
          const b = pts[j]!;
          if (Math.abs(a[0] - b[0]) > 40 || Math.abs(a[1] - b[1]) > 40) continue;
          if (cross !== null && Math.hypot(a[0] - cross.x, a[1] - cross.z) < 90 && Math.hypot(b[0] - cross.x, b[1] - cross.z) < 90) continue;
          const gap = Math.hypot(a[0] - b[0], a[1] - b[1]) - (route.widths[i]! + route.widths[j]!) / 2;
          expect(gap, `${id}:${SEEDS[k]} ${i}/${j}`).toBeGreaterThanOrEqual(12);
        }
      }
    }
  }, 60_000);

  test("dressed: grade-capped elevation, banked fast corners, width that varies, timed sectors", () => {
    const values = CLOSED.find((p) => p.id === id)!.values;
    for (const [k, route] of routes().entries()) {
      const label = `${id}:${SEEDS[k]}`;
      const h = route.heights!;
      expect(h, label).toBeDefined();
      const n = route.centerline.length;
      for (let i = 0; i < n; i += 1) {
        const a = route.centerline[i]!;
        const b = route.centerline[(i + 1) % n]!;
        const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
        expect(Math.abs(h[(i + 1) % n]! - h[i]!) / d, label).toBeLessThanOrEqual(Number(values.maxGrade) + 1e-3);
      }
      expect(route.banking!.some((roll) => Math.abs(roll) > 0.02), label).toBe(true);
      expect(Math.max(...route.widths) / Math.min(...route.widths), label).toBeGreaterThan(1.1);
      // Sectors split the simulated lap time roughly evenly.
      const profile = lapTimeProfile(route.centerline);
      const startIndex = route.centerline.findIndex((p) => p[0] === route.start.x && p[1] === route.start.z);
      const timeAt = (fraction: number): number => {
        const i = (startIndex + Math.round(fraction * n)) % n;
        return (profile.time[i]! - profile.time[startIndex]! + profile.lapTime) % profile.lapTime;
      };
      expect(route.sectors.length).toBe(3);
      const bounds = [...route.sectors.map(timeAt), profile.lapTime];
      for (let s = 0; s < 3; s += 1) {
        const share = (bounds[s + 1]! - bounds[s]!) / profile.lapTime;
        expect(share, label).toBeGreaterThan(0.18);
        expect(share, label).toBeLessThan(0.5);
      }
    }
  }, 60_000);
});

describe("circuit dials change what they say", () => {
  const seeds = ["d0", "d1", "d2", "d3"];
  const mean = (values: number[]): number => values.reduce((s, v) => s + v, 0) / values.length;
  const over = (presetId: string, overrides: Record<string, unknown>, measure: (route: CircuitRoute) => number): number =>
    mean(seeds.map((seed) => measure(race(presetId, seed, overrides).route!)));
  const perKm = (route: CircuitRoute): number => route.corners.length / (route.length / 1000);
  const footprint = (route: CircuitRoute): number => {
    const xs = route.centerline.map((p) => p[0]);
    const zs = route.centerline.map((p) => p[1]);
    return Math.sqrt((Math.max(...xs) - Math.min(...xs)) * (Math.max(...zs) - Math.min(...zs))) / route.length;
  };

  test("winding: more corners per km", () => {
    expect(over("circuit", { winding: 0.9 }, perKm)).toBeGreaterThan(over("circuit", { winding: 0.05 }, perKm));
  }, 60_000);

  test("compactness: the same lap packed into less ground", () => {
    expect(over("circuit", { compactness: 1 }, footprint)).toBeLessThan(over("circuit", { compactness: 0 }, footprint));
  }, 60_000);

  test("gridness: a street circuit's 90° corners", () => {
    const ninety = (route: CircuitRoute): number => route.corners.filter((c) => Math.abs((c.angle * 180) / Math.PI - 90) < 12).length / route.corners.length;
    expect(over("circuit", { gridness: 0.95 }, ninety)).toBeGreaterThan(over("circuit", { gridness: 0 }, ninety) + 0.15);
  }, 60_000);

  test("minCurveRadius sets the hairpins; width the track; lapLength the lap; elevation the relief", () => {
    const tightest = (route: CircuitRoute): number => route.tightestRadius;
    expect(over("circuit", { minCurveRadius: 20 }, tightest)).toBeGreaterThan(over("circuit", { minCurveRadius: 10 }, tightest) + 5);
    const meanWidth = (route: CircuitRoute): number => mean(route.widths);
    expect(over("circuit", { width: 16 }, meanWidth)).toBeGreaterThan(over("circuit", { width: 10 }, meanWidth) + 4);
    expect(over("circuit", { lapLength: 2000 }, (route) => route.length)).toBeLessThan(2200);
    const relief = (route: CircuitRoute): number => Math.max(...route.heights!) - Math.min(...route.heights!);
    expect(over("circuit", { elevation: 1 }, relief)).toBeGreaterThan(over("circuit", { elevation: 0.2 }, relief));
    expect(race("circuit", "d0", { elevation: 0 }).route!.heights).toBeUndefined();
  }, 60_000);

  test("branching builds the pit lane; crossover the figure-8", () => {
    expect(race("circuit", "d0", { branching: 0 }).route!.pit).toBeUndefined();
    expect(race("circuit", "d0", { branching: 0 }).network.nodes.every((node) => node.degree === 2)).toBe(true);
    expect(race("circuit", "d0", { crossover: true }).route!.crossings!.length).toBe(1);
    expect(race("circuit", "d0").route!.crossings!.length).toBe(0);
  }, 60_000);
});

describe("circuit volume and determinism", () => {
  test("a lap too long for its volume is shortened, and stays inside it", () => {
    const preset = CLOSED.find((p) => p.id === "high-speed")!;
    const made = runGenerator(RACE_CIRCUIT_GENERATOR, { ...preset.values, halfX: 300, halfZ: 220, seed: "small" });
    const route = made.route!;
    expect(route.length).toBeLessThan(Number(preset.values.lapLength));
    for (const [x, z] of route.centerline) {
      expect(Math.abs(x) + route.widths[0]! * 0.5).toBeLessThanOrEqual(300);
      expect(Math.abs(z) + route.widths[0]! * 0.5).toBeLessThanOrEqual(220);
    }
    for (const run of [...(route.runoff ?? []), ...(route.walls ?? [])]) {
      for (const [x, z] of run.points) {
        expect(Math.abs(x)).toBeLessThanOrEqual(300 + 1e-6);
        expect(Math.abs(z)).toBeLessThanOrEqual(220 + 1e-6);
      }
    }
  });

  test("same params and seed design the identical circuit", () => {
    const meta = { ...CLOSED.find((p) => p.id === "figure-8")!.values, seed: "same", halfX: 800, halfZ: 600 };
    expect(JSON.stringify(runGenerator(RACE_CIRCUIT_GENERATOR, meta))).toBe(JSON.stringify(runGenerator(RACE_CIRCUIT_GENERATOR, meta)));
  });
});
