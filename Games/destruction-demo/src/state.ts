import { PhysicsWorld } from "@jgengine/core/physics/physicsWorld";
import { StructureGraph, type StructureEdgeSpec, type StructureNodeSpec } from "@jgengine/core/physics/structure";
import { Grapple } from "@jgengine/core/physics/traversal";
import { carvableTerrain, type CarvableField } from "@jgengine/core/world/carve";
import { noiseField } from "@jgengine/core/world/terrain";

export interface DemoState {
  field: CarvableField;
  world: PhysicsWorld;
  grapple: Grapple;
  fieldEpoch: number;
  debrisCount: number;
  collapsedIds: readonly string[];
}

let state: DemoState | null = null;

function buildStructure(): { nodes: StructureNodeSpec[]; edges: StructureEdgeSpec[] } {
  const cluster: StructureNodeSpec[] = [
    { id: "core", position: [0, 3.1, 0], halfExtents: [0.6, 0.6, 0.6], mass: 1.4 },
    { id: "west", position: [-1.3, 3.1, 0], halfExtents: [0.55, 0.55, 0.55], mass: 1.2 },
    { id: "east", position: [1.3, 3.1, 0], halfExtents: [0.55, 0.55, 0.55], mass: 1.2 },
    { id: "north", position: [0, 3.1, 1.3], halfExtents: [0.55, 0.55, 0.55], mass: 1.2 },
    { id: "south", position: [0, 3.1, -1.3], halfExtents: [0.55, 0.55, 0.55], mass: 1.2 },
    { id: "crownA", position: [0, 4.3, 0.5], halfExtents: [0.5, 0.5, 0.5], mass: 1 },
    { id: "crownB", position: [0, 4.3, -0.5], halfExtents: [0.5, 0.5, 0.5], mass: 1 },
  ];
  const nodes: StructureNodeSpec[] = [
    { id: "foot", position: [0, 0.6, 0], halfExtents: [1.3, 0.6, 1.3], anchor: true, integrity: 400 },
    { id: "stem", position: [0, 1.9, 0], halfExtents: [0.7, 0.7, 0.7], integrity: 10 },
    ...cluster,
  ];
  const edges: StructureEdgeSpec[] = [
    { a: "foot", b: "stem", strength: 500 },
    { a: "stem", b: "core", strength: 200 },
    { a: "core", b: "west", strength: 120 },
    { a: "core", b: "east", strength: 120 },
    { a: "core", b: "north", strength: 120 },
    { a: "core", b: "south", strength: 120 },
    { a: "core", b: "crownA", strength: 120 },
    { a: "core", b: "crownB", strength: 120 },
  ];
  return { nodes, edges };
}

export function initDemo(): DemoState {
  const field = carvableTerrain(noiseField({ seed: "destruction", amplitude: 0.7, frequency: 0.04, baseHeight: 0 }));
  field.carve({ x: 0, z: 0, radius: 8, depth: 3.6 });
  field.carve({ x: 16, z: -10, radius: 5, depth: 2.4 });
  field.deposit({ x: -14, z: 8, radius: 4, height: 1.8 });

  const world = new PhysicsWorld({
    capacity: 64,
    bounds: { min: [-40, -4, -40], max: [40, 40, 40] },
    gravity: -18,
    cellSize: 4,
    restitution: 0.15,
  });

  const structure = new StructureGraph(buildStructure());
  const collapse = structure.damage("stem", 12);
  const bodies = structure.toDebris(world, collapse, { impulse: 5, origin: [0, 1.5, 0] });

  const grappleBody = world.addBody({ position: [21, 9, -10], halfExtents: [0.5, 0.5, 0.5], mass: 1 });
  const grapple = new Grapple(world, grappleBody, { maxLength: 40, minLength: 3, reelSpeed: 6 });
  grapple.fire(15, 17, -10);

  state = {
    field,
    world,
    grapple,
    fieldEpoch: 1,
    debrisCount: bodies.length,
    collapsedIds: collapse.fell,
  };
  return state;
}

export function currentDemo(): DemoState | null {
  return state;
}

export function stepDemo(dt: number): void {
  if (state === null) return;
  state.world.step(dt);
}
