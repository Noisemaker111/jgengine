import { describe, expect, test } from "bun:test";
import { createRigidBodyTree, type RigidBodyDefinition } from "./rigidBodyTree";

const pendulum: RigidBodyDefinition[] = [
  { name: "base", parent: -1, joint: { kind: "free" }, origin: [0, 0, 0], mass: 2, com: [0, 0, 0], inertia: [0.1, 0.1, 0.1, 0, 0, 0] },
  { name: "arm", parent: 0, joint: { kind: "revolute", axis: [1, 0, 0] }, origin: [0, 0, 0], mass: 1, com: [0, -0.5, 0], inertia: [0.02, 0.001, 0.02, 0, 0, 0] },
];

describe("rigidBodyTree snapshot", () => {
  test("restore puts back coordinates and applied forces", () => {
    const tree = createRigidBodyTree(pendulum);
    const q = [0, 1, 0, 1, 0, 0, 0, 0.4];
    const u = [0, 0, 0, 0, 0, 0, 1.5];
    tree.update(q, u);
    tree.clearForces([0, -9.81, 0]);
    tree.applyGeneralized(6, 0.3);
    const saved = tree.snapshot();
    const before = tree.accelerations(new Float64Array(tree.dofs));
    const energy = tree.kineticEnergy();

    tree.update([0, 0, 0, 1, 0, 0, 0, -1], [0, 0, 0, 0, 0, 0, 0]);
    tree.clearForces([0, 0, 0]);
    tree.restore(saved);

    expect(Array.from(tree.accelerations(new Float64Array(tree.dofs)))).toEqual(Array.from(before));
    expect(tree.kineticEnergy()).toBe(energy);
    expect(tree.snapshot()).toEqual(saved);
  });
});
