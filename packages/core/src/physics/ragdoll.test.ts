import { describe, expect, test } from "bun:test";

import { PhysicsWorld } from "./physicsWorld";
import { createRagdoll, type RagdollConfig } from "./ragdoll";

const BOUNDS = { min: [-20, 0, -20] as const, max: [20, 20, 20] as const };

function world(): PhysicsWorld {
  return new PhysicsWorld({ capacity: 64, bounds: BOUNDS, sleepThresholdSteps: 100000 });
}

function frames(w: PhysicsWorld, n: number): void {
  for (let i = 0; i < n; i += 1) w.step(1 / 60);
}

const BONES: RagdollConfig["bones"] = [
  { name: "head", position: [0, 8, 0], halfExtents: [0.3, 0.3, 0.3] },
  { name: "torso", position: [0, 7, 0], halfExtents: [0.35, 0.4, 0.35] },
  { name: "pelvis", position: [0, 6, 0], halfExtents: [0.35, 0.3, 0.35] },
];

const LINKS: RagdollConfig["links"] = [
  { a: "head", b: "torso" },
  { a: "torso", b: "pelvis" },
];

describe("ragdoll", () => {
  test("joints keep the bones connected after a fall", () => {
    const w = world();
    const rag = createRagdoll(w, { bones: BONES, links: LINKS });
    const headTorso = () => {
      const h = rag.bones.head!;
      const t = rag.bones.torso!;
      const dy = w.posY[h]! - w.posY[t]!;
      const dx = w.posX[h]! - w.posX[t]!;
      const dz = w.posZ[h]! - w.posZ[t]!;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };
    const rest = headTorso();
    frames(w, 400);
    expect(headTorso()).toBeCloseTo(rest, 1);
    expect(rag.links.length).toBe(2);
  });

  test("centerOfMass sits between the bones", () => {
    const w = world();
    const rag = createRagdoll(w, { bones: BONES, links: LINKS });
    const com = rag.centerOfMass();
    expect(com[1]).toBeGreaterThan(6);
    expect(com[1]).toBeLessThan(8);
  });

  test("the balance motor holds the root far above a floppy ragdoll", () => {
    const floppy = world();
    const floppyRag = createRagdoll(floppy, { bones: BONES, links: LINKS });

    const active = world();
    const activeRag = createRagdoll(active, {
      bones: BONES,
      links: LINKS,
      balance: { root: "torso", targetHeight: 7, strength: 30, moveForce: 0 },
    });

    for (let i = 0; i < 300; i += 1) {
      floppy.step(1 / 60);
      activeRag.balance(1 / 60);
      active.step(1 / 60);
    }

    const floppyTorso = floppy.posY[floppyRag.bones.torso!]!;
    const activeTorso = active.posY[activeRag.bones.torso!]!;
    expect(activeTorso).toBeGreaterThan(floppyTorso + 1.5);
  });

  test("remove detaches all joints", () => {
    const w = world();
    const rag = createRagdoll(w, { bones: BONES, links: LINKS });
    rag.remove();
    expect(w.jointCount).toBe(0);
    expect(rag.links.length).toBe(0);
  });
});
