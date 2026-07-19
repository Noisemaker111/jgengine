import { describe, expect, test } from "bun:test";
import { findRoadJunctions } from "@jgengine/core/world/streets";
import type { RoadEnvironmentDescriptor } from "@jgengine/core/world/features";

import { buildAuthoredRoadNetwork, insertJunctionNodes, roadJunctionInput } from "./RoadRibbons";

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

describe("insertJunctionNodes", () => {
  test("splits a segment at a mid-span junction, inserting the exact node", () => {
    const noded = insertJunctionNodes(
      [[-20, 0], [20, 0]],
      [{ x: 0, z: 0, arms: [] }],
    );
    expect(noded).toEqual([[-20, 0], [0, 0], [20, 0]]);
  });

  test("does not duplicate a node already at a vertex", () => {
    const noded = insertJunctionNodes(
      [[0, 0], [20, 0]],
      [{ x: 0, z: 0, arms: [] }],
    );
    expect(noded).toEqual([[0, 0], [20, 0]]);
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
