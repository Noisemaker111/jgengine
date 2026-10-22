import { describe, expect, test } from "bun:test";
import { createLaneGraph, laneGraphFromDocument, type LaneEdgeConfig, type LaneGraph } from "@jgengine/core/nav/laneGraph";

const CROSS_LANES: readonly LaneEdgeConfig[] = [
  { id: "east-in", points: [[60, 0, 0], [0, 0, 0]], speed: 12, entry: true },
  { id: "west-in", points: [[-60, 0, 0], [0, 0, 0]], speed: 12, entry: true },
  { id: "north-in", points: [[0, 0, -60], [0, 0, 0]], speed: 12, entry: true },
  { id: "south-in", points: [[0, 0, 60], [0, 0, 0]], speed: 12, entry: true },
  { id: "east-out", points: [[0, 0, 0], [60, 0, 0]], speed: 12, exit: true },
  { id: "west-out", points: [[0, 0, 0], [-60, 0, 0]], speed: 12, exit: true },
  { id: "north-out", points: [[0, 0, 0], [0, 0, -60]], speed: 12, exit: true },
  { id: "south-out", points: [[0, 0, 0], [0, 0, 60]], speed: 12, exit: true },
];

function crossGraph(): LaneGraph {
  return createLaneGraph({ lanes: CROSS_LANES });
}

describe("lane graph", () => {
  test("joining endpoints turns a four-arm cross into one intersection", () => {
    const graph = crossGraph();
    expect(graph.laneIds()).toHaveLength(8);
    expect(graph.intersections()).toHaveLength(1);
    const crossing = graph.intersections()[0]!;
    expect(crossing.inLanes).toEqual(["east-in", "north-in", "south-in", "west-in"]);
    expect(crossing.outLanes).toEqual(["east-out", "north-out", "south-out", "west-out"]);
    expect(crossing.kind).toBe("priority");
    expect(graph.entries()).toEqual(["east-in", "north-in", "south-in", "west-in"]);
    expect(graph.exits()).toEqual(["east-out", "north-out", "south-out", "west-out"]);
  });

  test("arcs, poses and projection agree", () => {
    const graph = crossGraph();
    const lane = graph.lane("east-in")!;
    expect(lane.length).toBeCloseTo(60, 6);
    expect(lane.from).not.toBe(lane.to);
    const start = graph.pose("east-in", 0)!;
    expect(start.position).toEqual([60, 0, 0] as never);
    const middle = graph.pose("east-in", 30)!;
    expect(middle.position[0]).toBeCloseTo(30, 6);
    // Headings match engine rotationY: +X travel is a quarter turn from +Z.
    expect(middle.heading).toBeCloseTo(-Math.PI / 2, 6);
    expect(graph.project("east-in", 12, 0.4)).toBeCloseTo(48, 6);
    // Two metres to the driver's left of a car heading -X is +Z.
    const lateral = graph.pose("east-in", 30, 2)!;
    expect(lateral.position[2]).toBeCloseTo(2, 6);
  });

  test("a declared node list joins exactly and rejects unknown parking lanes", () => {
    const graph = createLaneGraph({
      nodes: [
        { id: "junction", at: [0, 0, 0] },
        { id: "far", at: [200, 0, 0] },
      ],
      lanes: [
        { id: "in", points: [[200, 0, 0], [0, 0, 0]], from: "far", to: "junction", speed: 15 },
        { id: "out", points: [[0, 0, 0], [200, 0, 0]], from: "junction", to: "far", speed: 15 },
      ],
    });
    expect(graph.node("junction")).not.toBeNull();
    expect(graph.spots()).toHaveLength(0);
    expect(graph.intersections()).toHaveLength(0);
    expect(() => createLaneGraph({ lanes: [{ id: "a", points: [[0, 0, 0], [1, 0, 0]], left: "missing" }] })).toThrow(
      /unknown lane/,
    );
  });

  test("signals keep an authored phase list and reject a phase that names a stranger", () => {
    const signal = createLaneGraph({
      lanes: CROSS_LANES,
      intersections: [{ node: "@0.0,0.0", signal: { greenSeconds: 8, yellowSeconds: 2 } }],
    });
    const crossing = signal.intersection("@0.0,0.0")!;
    expect(crossing.kind).toBe("signal");
    // The runtime derives phases when the author lists none.
    expect(crossing.signal?.phases).toBeUndefined();
    expect(() =>
      createLaneGraph({
        lanes: CROSS_LANES,
        intersections: [{ node: "@0.0,0.0", signal: { greenSeconds: 8, yellowSeconds: 2, phases: [["nowhere"]] } }],
      }),
    ).toThrow(/does not enter/);
  });

  test("parking arcs become spots clamped inside the span", () => {
    const graph = createLaneGraph({
      lanes: [{ id: "street", points: [[0, 0, 0], [50, 0, 0]], parking: [10, 40, 900] }],
    });
    expect(graph.spots().map((spot) => spot.arc)).toEqual([10, 40, 50]);
    expect(graph.spot("street:parking:1")).not.toBeNull();
  });

  test("an authored scene becomes a lane graph: roads split at junctions, signals and parking read from markers", () => {
    const doc = {
      paths: [
        {
          id: "main",
          kind: "road",
          points: [
            { x: 0, y: 0, z: 0 },
            { x: 100, y: 0, z: 0 },
            { x: 200, y: 0, z: 0 },
          ],
          width: 9,
          meta: { level: "avenue" },
        },
        {
          id: "cross",
          kind: "road",
          points: [
            { x: 100, y: 0, z: -100 },
            { x: 100, y: 0, z: 0 },
            { x: 100, y: 0, z: 100 },
          ],
          width: 9,
          meta: { level: "street" },
        },
      ],
      markers: [
        {
          id: "junction",
          kind: "traffic_intersection",
          position: { x: 100, y: 0, z: 0 },
          meta: { signal: { greenSeconds: 10, yellowSeconds: 2 } },
        },
        { id: "kerb-1", kind: "traffic_parking", position: { x: 50, y: 0, z: 3 } },
        { id: "kerb-2", kind: "traffic_parking", position: { x: 150, y: 0, z: 3 } },
      ],
    } as never;

    const graph = laneGraphFromDocument(doc);
    const laneIds = graph.laneIds();
    // Every road is a lane per direction, split where the other road crosses it.
    expect(laneIds).toContain("main:f");
    expect(laneIds).toContain("main:f#2");
    expect(laneIds).toContain("main:r#2");
    expect(laneIds).toContain("cross:f#2");
    expect(laneIds).toHaveLength(8);
    expect(graph.lane("main:f")!.speed).toBe(16);
    expect(graph.lane("cross:f")!.speed).toBe(13);
    expect(graph.lane("main:f")!.length).toBeCloseTo(100, 6);

    const junction = graph.intersection("junction");
    expect(junction).not.toBeNull();
    expect(junction!.kind).toBe("signal");
    expect(junction!.inLanes).toHaveLength(4);
    expect(junction!.outLanes).toHaveLength(4);
    expect(graph.spots().map((spot) => spot.id).sort()).toEqual(["kerb-1", "kerb-2"]);
    expect(graph.spot("kerb-1")!.arc).toBeCloseTo(50, 1);

    // A hand-authored lane kind is one lane each and keeps its declared neighbours.
    const lanes = laneGraphFromDocument({
      paths: [
        { id: "slow", kind: "traffic_lane", points: [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }], width: 3.4, meta: { speed: 8, left: "fast" } },
        { id: "fast", kind: "traffic_lane", points: [{ x: 0, y: 0, z: 3.4 }, { x: 100, y: 0, z: 3.4 }], width: 3.4, meta: { speed: 20 } },
      ],
      markers: [],
    } as never);
    expect(lanes.laneIds()).toEqual(["slow", "fast"]);
    expect(lanes.lane("slow")!.speed).toBe(8);
    expect(lanes.lane("slow")!.left).toBe("fast");
  });
});
