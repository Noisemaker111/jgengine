import { describe, expect, test } from "bun:test";

import {
  resolveLocalAvoidance,
  type AvoidanceAgent,
} from "@jgengine/core/movement/avoidance";

function minSeparation(agents: AvoidanceAgent[]): number {
  let min = Infinity;
  for (let i = 0; i < agents.length; i += 1) {
    for (let j = i + 1; j < agents.length; j += 1) {
      const a = agents[i]!;
      const b = agents[j]!;
      const dist = Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1]);
      min = Math.min(min, dist - (a.radius + b.radius));
    }
  }
  return min;
}

describe("resolveLocalAvoidance", () => {
  test("pushes overlapping agents apart to at least the radii sum", () => {
    const agents: AvoidanceAgent[] = [
      { position: [0, 0], radius: 0.5 },
      { position: [0.4, 0], radius: 0.5 },
    ];
    resolveLocalAvoidance(agents, { iterations: 6 });
    expect(minSeparation(agents)).toBeGreaterThanOrEqual(-1e-6);
  });

  test("separates a dense clump within a few iterations", () => {
    const agents: AvoidanceAgent[] = [];
    for (let i = 0; i < 16; i += 1) {
      agents.push({ position: [(i % 4) * 0.2, Math.floor(i / 4) * 0.2], radius: 0.5 });
    }
    const before = minSeparation(agents);
    resolveLocalAvoidance(agents, { iterations: 12 });
    const after = minSeparation(agents);
    expect(before).toBeLessThan(0);
    expect(after).toBeGreaterThan(before);
    expect(after).toBeGreaterThanOrEqual(-0.05);
  });

  test("is deterministic and order-independent per pass", () => {
    const make = (): AvoidanceAgent[] => [
      { position: [0, 0], radius: 0.5 },
      { position: [0.3, 0.1], radius: 0.5 },
      { position: [0.1, 0.4], radius: 0.5 },
    ];
    const a = make();
    const b = make();
    resolveLocalAvoidance(a, { iterations: 4 });
    resolveLocalAvoidance(b, { iterations: 4 });
    expect(a.map((x) => x.position)).toEqual(b.map((x) => x.position));
  });

  test("a pinned agent (weight 0) does not move; its neighbor yields fully", () => {
    const agents: AvoidanceAgent[] = [
      { position: [0, 0], radius: 0.5 },
      { position: [0.4, 0], radius: 0.5 },
    ];
    resolveLocalAvoidance(agents, { iterations: 6, weights: [0, 1] });
    expect(agents[0]!.position[0]).toBeCloseTo(0, 6);
    expect(agents[0]!.position[1]).toBeCloseTo(0, 6);
    expect(agents[1]!.position[0]).toBeGreaterThanOrEqual(1 - 1e-6);
  });

  test("coincident agents separate deterministically instead of dividing by zero", () => {
    const agents: AvoidanceAgent[] = [
      { position: [1, 1], radius: 0.5 },
      { position: [1, 1], radius: 0.5 },
    ];
    resolveLocalAvoidance(agents, { iterations: 6 });
    const sep = Math.hypot(
      agents[0]!.position[0] - agents[1]!.position[0],
      agents[0]!.position[1] - agents[1]!.position[1],
    );
    expect(Number.isFinite(sep)).toBe(true);
    expect(sep).toBeGreaterThan(0);
  });

  test("padding enforces a gap beyond the radii", () => {
    const agents: AvoidanceAgent[] = [
      { position: [0, 0], radius: 0.5 },
      { position: [1.1, 0], radius: 0.5 },
    ];
    resolveLocalAvoidance(agents, { iterations: 8, padding: 0.5 });
    const gap = Math.hypot(
      agents[0]!.position[0] - agents[1]!.position[0],
      agents[0]!.position[1] - agents[1]!.position[1],
    );
    expect(gap).toBeGreaterThanOrEqual(1.5 - 1e-6);
  });

  test("returns 0 when agents already fit", () => {
    const agents: AvoidanceAgent[] = [
      { position: [0, 0], radius: 0.5 },
      { position: [5, 0], radius: 0.5 },
    ];
    expect(resolveLocalAvoidance(agents)).toBe(0);
  });
});
