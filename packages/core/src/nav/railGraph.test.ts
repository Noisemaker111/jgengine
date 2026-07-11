import { describe, expect, test } from "bun:test";

import { createRailGraph, createRailRider } from "@jgengine/core/nav/railGraph";

const yard = () =>
  createRailGraph({
    nodes: [
      { id: "a", at: [0, 0, 0] },
      { id: "junction", at: [0, 0, 10] },
      { id: "left", at: [-10, 0, 20] },
      { id: "right", at: [10, 0, 20] },
    ],
    edges: [
      { id: "approach", from: "a", to: "junction" },
      { id: "branch-left", from: "junction", to: "left" },
      { id: "branch-right", from: "junction", to: "right" },
    ],
  });

describe("createRailGraph", () => {
  test("resolves edges with lengths and declaration-ordered out-edges", () => {
    const graph = yard();
    expect(graph.edge("approach")!.length).toBe(10);
    expect(graph.outEdges("junction")).toEqual(["branch-left", "branch-right"]);
    expect(graph.outEdges("left")).toEqual([]);
    expect(graph.thrownEdge("junction")).toBe("branch-left");
    expect(graph.thrownEdge("left")).toBeNull();
  });

  test("throwSwitch only accepts an out-edge of that node", () => {
    const graph = yard();
    expect(graph.throwSwitch("junction", "branch-right")).toBe(true);
    expect(graph.thrownEdge("junction")).toBe("branch-right");
    expect(graph.throwSwitch("junction", "approach")).toBe(false);
    expect(graph.throwSwitch("nowhere", "branch-left")).toBe(false);
  });

  test("via points shape the edge polyline", () => {
    const graph = createRailGraph({
      nodes: [
        { id: "a", at: [0, 0, 0] },
        { id: "b", at: [10, 0, 10] },
      ],
      edges: [{ id: "curve", from: "a", to: "b", via: [[10, 0, 0]] }],
    });
    expect(graph.edge("curve")!.length).toBe(20);
  });

  test("rejects duplicate ids and unknown node references", () => {
    expect(() =>
      createRailGraph({
        nodes: [{ id: "a", at: [0, 0, 0] }],
        edges: [{ id: "ghost", from: "a", to: "missing" }],
      }),
    ).toThrow();
  });
});

describe("createRailRider", () => {
  test("rides across the junction on whichever edge is thrown", () => {
    const graph = yard();
    const rider = createRailRider(graph, { edgeId: "approach", speed: 5 });
    const mid = rider.advance(1);
    expect(mid.edgeId).toBe("approach");
    expect(mid.position).toEqual([0, 0, 5]);

    graph.throwSwitch("junction", "branch-right");
    const past = rider.advance(2);
    expect(past.edgeId).toBe("branch-right");
    expect(past.s).toBeCloseTo(5, 5);

    const again = createRailRider(graph, { edgeId: "approach", speed: 5 });
    graph.throwSwitch("junction", "branch-left");
    const left = again.advance(3);
    expect(left.edgeId).toBe("branch-left");
  });

  test("stops at a dead end and reports it", () => {
    const graph = yard();
    const rider = createRailRider(graph, { edgeId: "branch-left", speed: 100 });
    const pose = rider.advance(10);
    expect(pose.atDeadEnd).toBe(true);
    expect(pose.position).toEqual([-10, 0, 20]);
    expect(rider.advance(1).position).toEqual([-10, 0, 20]);
  });

  test("place re-rails the rider and clears the dead end", () => {
    const graph = yard();
    const rider = createRailRider(graph, { edgeId: "branch-left", speed: 100 });
    rider.advance(10);
    rider.place("approach", 2);
    const pose = rider.pose();
    expect(pose.edgeId).toBe("approach");
    expect(pose.atDeadEnd).toBe(false);
    expect(pose.position).toEqual([0, 0, 2]);
  });
});
