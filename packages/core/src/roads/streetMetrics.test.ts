import { describe, expect, test } from "bun:test";
import { roadElevationMetrics, streetNetworkMetrics, type MetricGraphEdge, type MetricGraphNode, type PlanPoint } from "./streetMetrics";

/** A plus-grid: lines x ∈ {-100, 0, 100} and z ∈ {-100, 0, 100} running rim to rim of a 300 m box. */
function plusGrid(levelOf: (vertical: boolean, fixed: number, from: number) => string = () => "street") {
  const stops = [-150, -100, 0, 100, 150];
  const nodes: MetricGraphNode[] = [];
  const ids = new Map<string, number>();
  const node = (x: number, z: number): number => {
    const key = `${x},${z}`;
    if (!ids.has(key)) {
      ids.set(key, nodes.length);
      nodes.push({ id: nodes.length, x, z });
    }
    return ids.get(key)!;
  };
  const edges: MetricGraphEdge[] = [];
  const streets: { points: PlanPoint[] }[] = [];
  for (const fixed of [-100, 0, 100]) {
    for (const vertical of [true, false]) {
      const line: PlanPoint[] = [];
      for (let i = 0; i + 1 < stops.length; i += 1) {
        const p: PlanPoint = vertical ? [fixed, stops[i]!] : [stops[i]!, fixed];
        const q: PlanPoint = vertical ? [fixed, stops[i + 1]!] : [stops[i + 1]!, fixed];
        edges.push({ a: node(p[0], p[1]), b: node(q[0], q[1]), points: [p, q], level: levelOf(vertical, fixed, stops[i]!), width: 10 });
        if (i === 0) line.push(p);
        line.push(q);
      }
      streets.push({ points: line });
    }
  }
  return { nodes, edges, streets };
}

describe("streetNetworkMetrics", () => {
  test("a rim-to-rim plus grid has the hand-counted density, degree mix, order and blocks", () => {
    const m = streetNetworkMetrics(plusGrid(), { bounds: { halfX: 150, halfZ: 150 } });
    expect(m.areaKm2).toBeCloseTo(0.09, 12);
    expect(m.roadKm).toBeCloseTo(1.8, 9);
    expect(m.roadKmPerKm2).toBeCloseTo(20, 9);
    expect(m.intersections).toBe(9);
    expect(m.intersectionsPerKm2).toBeCloseTo(100, 9);
    expect(m.degree).toEqual({ deadEndInterior: 0, deadEndRim: 12, threeWay: 0, fourWay: 9, fivePlus: 0 });
    expect(m.fourWayShare).toBeCloseTo(9 / 21, 12);
    expect(m.deadEndInteriorShare).toBe(0);
    expect(m.streetsPerNode).toBeCloseTo((12 + 36) / 21, 12);
    expect(m.components).toBe(1);
    expect(m.orientationOrder).toBeCloseTo(1, 12);
    expect(m.edgeCircuity).toBeCloseTo(1, 12);
    expect(m.blocks.count).toBe(4);
    expect(m.blocks.medianHa).toBeCloseTo(1, 9);
    expect(m.blocks.cv).toBeCloseTo(0, 9);
    expect(m.enclosedShare).toBeCloseTo(40000 / 90000, 9);
    // Each 100 m block loses a 5 m band along its 400 m perimeter.
    expect(m.landInBlocksShare).toBeCloseTo((4 * (10000 - 2000)) / 90000, 9);
    expect(m.keptLengthShare).toBeCloseTo(1, 9);
  });

  test("hierarchy shares and level flips count only arterial straight-through changes", () => {
    const graph = plusGrid((vertical, fixed, from) => (vertical && fixed === 0 ? (from === 0 ? "boulevard" : "avenue") : "street"));
    const m = streetNetworkMetrics({ ...graph, streets: graph.streets.slice(1) }, { bounds: { halfX: 150, halfZ: 150 } });
    expect(m.arterialShare).toBeCloseTo(300 / 1800, 9);
    expect(m.levelShares.boulevard).toBeCloseTo(100 / 1800, 9);
    expect(m.straightThroughArterial).toBe(3);
    expect(m.levelFlips).toBe(2);
    expect(m.levelFlipRate).toBeCloseTo(2 / 3, 12);
    expect(m.keptLengthShare).toBeCloseTo(1500 / 1800, 9);
  });

  test("36 evenly spread spokes have zero orientation order", () => {
    const nodes: MetricGraphNode[] = [{ id: 0, x: 0, z: 0 }];
    const edges: MetricGraphEdge[] = [];
    for (let k = 0; k < 36; k += 1) {
      const a = (k * 10 * Math.PI) / 180;
      const p: PlanPoint = [Math.sin(a) * 100, Math.cos(a) * 100];
      nodes.push({ id: k + 1, x: p[0], z: p[1] });
      edges.push({ a: 0, b: k + 1, points: [[0, 0], p] });
    }
    const m = streetNetworkMetrics({ nodes, edges }, { bounds: { halfX: 200, halfZ: 200 } });
    expect(m.orientationEntropy).toBeCloseTo(Math.log(36), 9);
    expect(m.orientationOrder).toBeCloseTo(0, 9);
    expect(m.degree.deadEndInterior).toBe(36);
    expect(m.blocks.count).toBe(0);
  });

  test("a U-shaped road has detour ratio and circuity from its hand-measured paths", () => {
    const nodes: MetricGraphNode[] = [
      { id: 0, x: -100, z: 0 },
      { id: 1, x: -100, z: 100 },
      { id: 2, x: 100, z: 100 },
      { id: 3, x: 100, z: 0 },
    ];
    const edges: MetricGraphEdge[] = [
      { a: 0, b: 1, points: [[-100, 0], [-100, 100]] },
      { a: 1, b: 2, points: [[-100, 100], [100, 100]] },
      { a: 2, b: 3, points: [[100, 100], [100, 0]] },
    ];
    const m = streetNetworkMetrics({ nodes, edges }, { bounds: { halfX: 500, halfZ: 500 }, detourMinDistance: 150 });
    const diag = 300 / Math.hypot(200, 100);
    expect(m.detourRatio).toBeCloseTo((2 * (2 * diag + 2 + 1)) / 8, 9);
    expect(m.edgeCircuity).toBeCloseTo(2, 9);
    expect(m.degree.deadEndInterior).toBe(2);
    expect(m.intersections).toBe(0);
  });
});

describe("roadElevationMetrics", () => {
  test("grade, junction step and road-vs-ground on a hand-built ramp", () => {
    const ramp = { points: [[0, 0], [10, 0], [20, 0], [30, 0]] as PlanPoint[], heights: [0, 1, 2, 3] };
    const spur = { points: [[30, 0], [30, 20]] as PlanPoint[], heights: [3.5, 3.5] };
    const bridge = { points: [[0, 50], [10, 50], [20, 50]] as PlanPoint[], heights: [0, 8, 0], features: [{ from: 1, to: 1 }] };
    const m = roadElevationMetrics([ramp, spur, bridge], { heightAt: () => 0, gradeBaseline: 5 });
    expect(m.maxGrade).toBeCloseTo(0.8, 9);
    expect(m.junctionStepMax).toBeCloseTo(0.5, 9);
    expect(m.reliefM).toBe(8);
    // Ground is flat: the bridge deck's raised point is skipped, everything else counts.
    expect(m.roadVsGroundMax).toBeCloseTo(3.5, 9);
    expect(m.roadVsGroundMean).toBeCloseTo((0 + 1 + 2 + 3 + 3.5 + 3.5 + 0 + 0) / 8, 9);
  });
});
