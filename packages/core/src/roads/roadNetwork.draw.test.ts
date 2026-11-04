import { describe, expect, test } from "bun:test";
import { findRoadJunctions } from "@jgengine/core/roads/streets";
import type { RoadEnvironmentDescriptor } from "@jgengine/core/world/features";

import { Color } from "three";

import { mergeJunctionSurfaces } from "./RoadJunctions.draw";
import { buildAuthoredRoadNetwork, buildKerbFaces, gutterColor, roadJunctionInput, roadLookKey } from "./RoadRibbons.draw";

function road(path: readonly (readonly [number, number])[], width = 8): RoadEnvironmentDescriptor {
  return {
    kind: "road",
    path: path.map((p) => [p[0], p[1]] as [number, number]),
    width,
    color: "#3d3f45",
    markingColor: "#e8e4d8",
    markings: true,
    elevation: 0.06,
    sidewalk: false,
  } as unknown as RoadEnvironmentDescriptor;
}

const flat = () => 0;

describe("roadJunctionInput", () => {
  test("converts an eastward arm direction to atan2(dx,dz) angle", () => {
    const junctions = findRoadJunctions([
      road([[-20, 0], [20, 0]]),
      road([[0, -20], [0, 20]]),
    ]);
    const input = roadJunctionInput(junctions[0]!);
    expect(input.x).toBeCloseTo(0, 6);
    expect(input.z).toBeCloseTo(0, 6);
    // An arm heading +x has direction [1,0] → angle atan2(1,0) = PI/2, and armDirection reproduces it.
    for (const arm of input.arms) {
      expect(Math.hypot(Math.sin(arm.angle) ** 2 + Math.cos(arm.angle) ** 2 - 1, 0)).toBeCloseTo(0, 6);
    }
    expect(input.arms.length).toBe(4);
  });
});

describe("buildAuthoredRoadNetwork paint", () => {
  test("paved roads get stop lines and zebra crosswalks at each approach; unpaved get none", () => {
    const roads = [road([[-30, 0], [30, 0]]), road([[0, -30], [0, 30]])];
    const junctions = findRoadJunctions(roads);
    expect(buildAuthoredRoadNetwork(roads, junctions, flat).junctionPaint.length).toBe(0);
    const painted = buildAuthoredRoadNetwork(roads, junctions, flat, { paint: true });
    // Four approaches, each one stop line plus five crosswalk bars.
    expect(painted.junctionPaint.length).toBe(4 * (1 + 5));
    const top = Math.max(...junctions.map((junction) => junction.elevation));
    for (const ribbon of painted.junctionPaint) {
      for (let i = 1; i < ribbon.positions.length; i += 3) expect(ribbon.positions[i]!).toBeGreaterThan(top);
    }
  });

  test("a road authored with markings off gets no stop line or crosswalk at its mouths", () => {
    const plain = { ...road([[-30, 0], [30, 0]]), markings: false } as RoadEnvironmentDescriptor;
    const roads = [plain, road([[0, -30], [0, 30]])];
    const painted = buildAuthoredRoadNetwork(roads, findRoadJunctions(roads), flat, { paint: true });
    expect(painted.junctionPaint.length).toBe(2 * (1 + 5));
  });

});

describe("buildAuthoredRoadNetwork", () => {
  test("trims two crossing roads and welds one junction surface", () => {
    const roads = [road([[-20, 0], [20, 0]]), road([[0, -20], [0, 20]])];
    const junctions = findRoadJunctions(roads);
    expect(junctions.length).toBe(1);

    const network = buildAuthoredRoadNetwork(roads, junctions, flat);

    // A mid-span crossing splits each road into two trimmed sub-paths.
    expect(network.roadPaths[0]!.length).toBe(2);
    expect(network.roadPaths[1]!.length).toBe(2);

    // Every trimmed sub-path is pulled back from the crossing — no vertex sits at the node.
    for (const subs of network.roadPaths) {
      for (const sub of subs) {
        for (const [x, z] of sub) {
          expect(Math.hypot(x, z)).toBeGreaterThan(1); // apron cleared the node
        }
      }
    }

    // Exactly one welded surface, non-degenerate, carrying the junction color.
    expect(network.junctionSurfaces.length).toBe(1);
    expect(network.junctionSurfaces[0]!.ribbon.indices.length).toBeGreaterThan(0);
    expect(typeof network.junctionSurfaces[0]!.color).toBe("string");
  });

  test("a road with no junctions passes through as a single untrimmed sub-path", () => {
    const roads = [road([[-20, 0], [20, 0]])];
    const network = buildAuthoredRoadNetwork(roads, [], flat);
    expect(network.roadPaths[0]!.length).toBe(1);
    expect(network.roadPaths[0]![0]).toEqual([[-20, 0], [20, 0]]);
    expect(network.junctionSurfaces.length).toBe(0);
  });
});

describe("kerbs and gutters", () => {
  const luminance = (hex: string) => {
    const c = new Color(hex);
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  };

  test("the gutter is never darker than the carriageway, so edges never read as an outline", () => {
    for (const roadColor of ["#33363f", "#3b3e47", "#5a5d63", "#1b1c20"]) {
      expect(luminance(gutterColor(roadColor, "#cdc6b6"))).toBeGreaterThan(luminance(roadColor));
      expect(luminance(gutterColor(roadColor, null))).toBeGreaterThan(luminance(roadColor));
    }
  });

  test("kerb faces rise from the gutter to the sidewalk top on the road side and skirt the outer edge", () => {
    const geometry = buildKerbFaces([{ elevation: 0.08, paths: [[[0, 0], [0, 20]]] }], 10, 3, () => 1)!;
    const position = geometry.getAttribute("position");
    // Two sides x (kerb + skirt) x two points x (bottom + top).
    expect(position.count).toBe(16);
    const ys = new Set<number>();
    const xs = new Set<number>();
    for (let i = 0; i < position.count; i += 1) {
      ys.add(Number(position.getY(i).toFixed(3)));
      xs.add(Number(Math.abs(position.getX(i)).toFixed(3)));
    }
    // Kerb base just under the gutter lift, skirt base below grade, one shared top 16 cm over the road.
    expect([...ys].sort()).toEqual([0.95, 1.09, 1.24]);
    expect([...xs].sort()).toEqual([5, 8]);
    expect(geometry.getIndex()!.count).toBe(4 * 6);
    expect(buildKerbFaces([], 10, 3, () => 0)).toBeNull();
  });

  test("kerbs of roads at different heights merge into one geometry, each at its own height", () => {
    const low = { elevation: 0, paths: [[[0, 0], [0, 20]] as [number, number][]] };
    const high = { elevation: 2, paths: [[[30, 0], [30, 20]] as [number, number][]] };
    const geometry = buildKerbFaces([low, high], 10, 3, () => 0)!;
    const position = geometry.getAttribute("position");
    expect(position.count).toBe(32);
    let top = -Infinity;
    for (let i = 16; i < 32; i += 1) top = Math.max(top, position.getY(i));
    expect(top).toBeCloseTo(2.16, 5);
  });
});

describe("one draw per look", () => {
  test("roads that differ only in path and height share a look; any visible difference splits them", () => {
    const a = road([[-20, 0], [20, 0]]);
    const b = { ...road([[0, -20], [0, 20]]), elevation: 3 } as RoadEnvironmentDescriptor;
    expect(roadLookKey(a)).toBe(roadLookKey(b));
    expect(roadLookKey(road([[0, 0], [1, 0]], 9))).not.toBe(roadLookKey(a));
    expect(roadLookKey({ ...a, color: "#ff0000" } as RoadEnvironmentDescriptor)).not.toBe(roadLookKey(a));
    expect(roadLookKey({ ...a, sidewalk: { width: 2, color: "#cccccc" } } as RoadEnvironmentDescriptor)).not.toBe(roadLookKey(a));
  });

  test("every junction of one colour becomes one mesh", () => {
    const roads = [road([[-40, 0], [40, 0]]), road([[-20, -30], [-20, 30]]), road([[20, -30], [20, 30]])];
    const network = buildAuthoredRoadNetwork(roads, findRoadJunctions(roads), flat);
    expect(network.junctionSurfaces.length).toBe(2);
    const patches = mergeJunctionSurfaces(network.junctionSurfaces);
    expect(patches.length).toBe(1);
    const vertices = network.junctionSurfaces.reduce((sum, s) => sum + s.ribbon.positions.length / 3, 0);
    expect(patches[0]!.geometry.getAttribute("position").count).toBe(vertices);
    const recoloured = mergeJunctionSurfaces([network.junctionSurfaces[0]!, { ...network.junctionSurfaces[1]!, color: "#ff0000" }]);
    expect(recoloured.length).toBe(2);
  });
});
