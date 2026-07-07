import { describe, expect, test } from "bun:test";

import { PhysicsWorld } from "./physicsWorld";
import { StructureGraph, type StructureEdgeSpec, type StructureNodeSpec } from "./structure";

function tower(): { nodes: StructureNodeSpec[]; edges: StructureEdgeSpec[] } {
  const nodes: StructureNodeSpec[] = [
    { id: "foot", position: [0, 0.5, 0], halfExtents: [1, 0.5, 1], anchor: true, integrity: 100 },
    { id: "mid", position: [0, 1.5, 0], halfExtents: [1, 0.5, 1], integrity: 20 },
    { id: "top", position: [0, 2.5, 0], halfExtents: [1, 0.5, 1], integrity: 100 },
    { id: "cap", position: [0, 3.5, 0], halfExtents: [1, 0.5, 1], integrity: 100 },
  ];
  const edges: StructureEdgeSpec[] = [
    { a: "foot", b: "mid", strength: 50 },
    { a: "mid", b: "top", strength: 50 },
    { a: "top", b: "cap", strength: 50 },
  ];
  return { nodes, edges };
}

describe("StructureGraph", () => {
  test("everything reachable from an anchor is supported", () => {
    const g = new StructureGraph(tower());
    expect(g.isSupported("foot")).toBe(true);
    expect(g.isSupported("cap")).toBe(true);
    expect(g.standing().length).toBe(4);
  });

  test("shattering a mid piece drops the whole disconnected subgraph above it", () => {
    const g = new StructureGraph(tower());
    const event = g.damage("mid", 25);
    expect(event.collapsed).toBe(true);
    expect(new Set(event.fell)).toEqual(new Set(["mid", "top", "cap"]));
    expect(g.has("mid")).toBe(false);
    expect(g.has("top")).toBe(false);
    expect(g.standing()).toEqual(["foot"]);
  });

  test("damage under integrity does not collapse", () => {
    const g = new StructureGraph(tower());
    const event = g.damage("mid", 5);
    expect(event.collapsed).toBe(false);
    expect(event.fell.length).toBe(0);
    expect(g.integrityOf("mid")).toBe(15);
    expect(g.standing().length).toBe(4);
  });

  test("severing an edge disconnects the pieces beyond it", () => {
    const g = new StructureGraph(tower());
    const event = g.severEdge("mid", "top");
    expect(new Set(event.fell)).toEqual(new Set(["top", "cap"]));
    expect(g.isSupported("mid")).toBe(true);
    expect(g.has("top")).toBe(false);
  });

  test("edge damage accumulates and severs past strength", () => {
    const g = new StructureGraph(tower());
    expect(g.damageEdge("foot", "mid", 30).collapsed).toBe(false);
    const event = g.damageEdge("foot", "mid", 30);
    expect(event.collapsed).toBe(true);
    expect(new Set(event.fell)).toEqual(new Set(["mid", "top", "cap"]));
  });

  test("collapsed pieces sink into the physics world as debris bodies", () => {
    const g = new StructureGraph(tower());
    const world = new PhysicsWorld({
      capacity: 32,
      bounds: { min: [-20, 0, -20], max: [20, 20, 20] },
      gravity: -20,
    });
    const event = g.damage("mid", 25);
    const bodies = g.toDebris(world, event, { impulse: 4, origin: [0, 0, 0] });
    expect(bodies.length).toBe(3);
    expect(world.count).toBe(3);
    const anyMoving = bodies.some((b) => world.velY[b]! !== 0 || world.velX[b]! !== 0 || world.velZ[b]! !== 0);
    expect(anyMoving).toBe(true);
    const before = world.posY[bodies[0]!]!;
    for (let i = 0; i < 60; i += 1) world.step(1 / 60);
    expect(world.posY[bodies[0]!]!).toBeLessThan(before);
  });
});
