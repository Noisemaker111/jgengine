import { describe, expect, test } from "bun:test";
import {
  DEPOT_NODE_ID,
  edgeLength,
  JUNCTION_NODE_IDS,
  nextEdge,
  previewRoute,
  RAIL_EDGES,
  RAIL_NODES,
  TERMINUS_NODE_ID,
  type ThrowStates,
} from "./network";

describe("rail network content budget", () => {
  test("20 segments", () => expect(RAIL_EDGES.length).toBe(20));
  test("8 junctions", () => expect(JUNCTION_NODE_IDS.length).toBe(8));
  test("4 stations", () => expect(RAIL_NODES.filter((n) => n.kind === "station").length).toBe(4));
  test("1 tunnel + 1 trestle, both single-track", () => {
    const tunnels = RAIL_EDGES.filter((e) => e.kind === "tunnel");
    const trestles = RAIL_EDGES.filter((e) => e.kind === "trestle");
    expect(tunnels).toHaveLength(1);
    expect(trestles).toHaveLength(1);
    expect(tunnels[0]!.singleTrack).toBe(true);
    expect(trestles[0]!.singleTrack).toBe(true);
  });
  test("2 single-track sections total", () => {
    expect(RAIL_EDGES.filter((e) => e.singleTrack).length).toBe(2);
  });
  test("every edge has positive length", () => {
    for (const edge of RAIL_EDGES) expect(edgeLength(edge)).toBeGreaterThan(0);
  });
});

describe("junction routing", () => {
  test("thrown state selects the branch", () => {
    const normal: ThrowStates = { j1: "normal" };
    const reverse: ThrowStates = { j1: "reverse" };
    const viaNormal = nextEdge("j1", "e-depot-j1", normal);
    const viaReverse = nextEdge("j1", "e-depot-j1", reverse);
    expect(viaNormal).not.toBeNull();
    expect(viaReverse).not.toBeNull();
    expect(viaNormal!.id).not.toBe(viaReverse!.id);
  });

  test("arriving via a branch always continues to the sole remaining edge, regardless of throw", () => {
    const normal: ThrowStates = { j2: "normal" };
    const reverse: ThrowStates = { j2: "reverse" };
    const a = nextEdge("j2", "e-lowdale-j2", normal);
    const b = nextEdge("j2", "e-lowdale-j2", reverse);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.id).toBe(b!.id);
    expect(a!.id).toBe("e-j2-j3");
  });

  test("degree-1 station has no next edge", () => {
    expect(nextEdge(TERMINUS_NODE_ID, "e-j8-terminus", {})).toBeNull();
  });

  test("deterministic: same inputs always pick the same edge", () => {
    const states: ThrowStates = { j5: "reverse" };
    const first = nextEdge("j5", "e-j4-j5", states);
    const second = nextEdge("j5", "e-j4-j5", states);
    expect(first!.id).toBe(second!.id);
  });
});

describe("route connectivity", () => {
  test("every combination of the 4 real diverge junctions still reaches Terminus", () => {
    const diverges = ["j1", "j3", "j5", "j7"] as const;
    for (let mask = 0; mask < 16; mask += 1) {
      const throwStates: ThrowStates = {};
      diverges.forEach((id, i) => {
        throwStates[id] = (mask & (1 << i)) === 0 ? "normal" : "reverse";
      });
      const preview = previewRoute(DEPOT_NODE_ID, null, throwStates, 40);
      expect(preview.reachedTerminal).toBe(true);
      expect(preview.nodeIds[preview.nodeIds.length - 1]).toBe(TERMINUS_NODE_ID);
    }
  });
});
