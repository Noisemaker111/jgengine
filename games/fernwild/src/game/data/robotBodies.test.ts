import { describe, expect, test } from "bun:test";

import { bodyGlbModel } from "../../engine-local/creatureBody/bodyPlan";
import { encodeGlb } from "../../engine-local/creatureBody/glbWrite";
import { BOTS, TEMPERAMENT_GLOW } from "./bots";
import { ROBOT_BODIES } from "./robotBodies";
import { SPECIES } from "./species";

describe("robot bodies", () => {
  test("every species has a robot body and every non-boss species a machine profile", () => {
    expect(Object.keys(ROBOT_BODIES).sort()).toEqual(Object.keys(SPECIES).sort());
    for (const id of Object.keys(SPECIES)) if (!id.startsWith("hivemind_")) expect(BOTS[id], id).toBeDefined();
  });

  test("each body builds as an animated machine with glowing eyes in its temperament's colour", () => {
    for (const [species, robot] of Object.entries(ROBOT_BODIES)) {
      const model = bodyGlbModel(robot.plan);
      expect(model.clips.map((clip) => clip.name), species).toEqual(["Idle", "Walk", "Run", "Attack", "Death"]);
      const eye = model.materials.find((material) => material.name === "eye");
      expect(eye?.emissive, species).toBeDefined();
      const temperament = BOTS[species]?.temperament;
      if (temperament !== undefined && species !== "root_server") expect(eye?.emissive, species).toBe(TEMPERAMENT_GLOW[temperament]);
      expect(model.materials.find((material) => material.name === "body")?.metalness ?? 0, species).toBeGreaterThan(0);
      expect(encodeGlb(model).byteLength, species).toBeGreaterThan(1000);
      expect(robot.height, species).toBeGreaterThan(0.2);
    }
  });

  test("silhouettes differ: the forklift carries forks and the beetle a drill", () => {
    const triangles = (species: string) => bodyGlbModel(ROBOT_BODIES[species]!.plan).nodes.reduce((sum, node) => sum + node.primitives.reduce((n, p) => n + p.indices.length / 3, 0), 0);
    const plain = (species: string) => {
      const plan = ROBOT_BODIES[species]!.plan;
      return bodyGlbModel({ ...plan, machine: { glow: plan.machine!.glow } }).nodes.reduce((sum, node) => sum + node.primitives.reduce((n, p) => n + p.indices.length / 3, 0), 0);
    };
    expect(triangles("craneback")).toBeGreaterThan(plain("craneback"));
    expect(triangles("thermite")).toBeGreaterThan(plain("thermite"));
  });
});
