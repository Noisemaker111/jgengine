import { describe, expect, test } from "bun:test";
import { edgeLength, RAIL_EDGES } from "./network";
import { nextForwardArrival, trainById, trainPositionAt, trainRouteLength, TRAINS } from "./schedule";

describe("train schedule determinism", () => {
  test("position-at-time is pure: same t always yields the same pose", () => {
    for (const train of TRAINS) {
      const a = trainPositionAt(train, 17.25);
      const b = trainPositionAt(train, 17.25);
      expect(a).toEqual(b);
    }
  });

  test("4 scheduled trains with distinct speeds", () => {
    expect(TRAINS).toHaveLength(4);
    const speeds = new Set(TRAINS.map((t) => t.speed));
    expect(speeds.size).toBeGreaterThanOrEqual(3);
  });

  test("express is the fastest train", () => {
    const express = trainById("express");
    for (const train of TRAINS) {
      if (train.id === "express") continue;
      expect(express.speed).toBeGreaterThan(train.speed);
    }
  });

  test("a train starts its cycle at its first route node", () => {
    const local = trainById("local");
    const pose = trainPositionAt(local, -local.offsetSeconds);
    const firstEdge = RAIL_EDGES.find((e) => e.id === pose.edgeId);
    expect(firstEdge).toBeDefined();
    expect(pose.edgeT).toBeCloseTo(0, 5);
  });

  test("out-and-back: direction flips after reaching the far end", () => {
    const freight = trainById("freight-lowdale");
    const total = trainRouteLength(freight);
    const halfway = total / freight.speed - freight.offsetSeconds;
    const justBefore = trainPositionAt(freight, halfway - 0.01);
    const justAfter = trainPositionAt(freight, halfway + 0.01);
    expect(justBefore.direction).toBe(1);
    expect(justAfter.direction).toBe(-1);
  });

  test("position stays within the route's bounding edges (no teleporting off-graph)", () => {
    const express = trainById("express");
    for (let t = 0; t < 200; t += 3.7) {
      const pose = trainPositionAt(express, t);
      expect(pose.edgeId).not.toBeNull();
      const edge = RAIL_EDGES.find((e) => e.id === pose.edgeId)!;
      expect(edgeLength(edge)).toBeGreaterThan(0);
      expect(pose.edgeT).toBeGreaterThanOrEqual(0);
      expect(pose.edgeT).toBeLessThanOrEqual(1);
    }
  });
});

describe("next forward arrival", () => {
  test("express reaches the far end after totalLength/speed seconds when starting at t=0", () => {
    const express = trainById("express");
    const total = trainRouteLength(express);
    const deadline = nextForwardArrival(express, 0);
    expect(deadline).toBeCloseTo(total / express.speed, 4);
  });

  test("matches a brute-force scan for the same arrival time", () => {
    const local = trainById("local");
    const now = 12.4;
    const closedForm = nextForwardArrival(local, now);
    const lastEdgeId = local.routeNodeIds.length >= 2 ? "e-j4-j5" : null;
    let bruteForce = -1;
    for (let dt = 0; dt < 200; dt += 0.002) {
      const pose = trainPositionAt(local, now + dt);
      if (pose.direction === 1 && pose.edgeId === lastEdgeId && Math.abs(pose.edgeT - 1) < 0.0015) {
        bruteForce = dt;
        break;
      }
    }
    expect(bruteForce).toBeGreaterThanOrEqual(0);
    expect(closedForm).toBeCloseTo(bruteForce, 1);
  });
});
