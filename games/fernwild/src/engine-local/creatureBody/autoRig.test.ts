// framework-ok: only Fernwild uses this; the second adopter extracts it (#2837)
import { describe, expect, test } from "bun:test";

import { autoRig } from "./autoRig";
import { bodyGlbModel, type BodyPlan } from "./bodyPlan";
import { readGlbModel } from "./glbRead";
import { encodeGlb } from "./glbWrite";

const COW: BodyPlan = {
  torso: { length: 2, height: 1, width: 0.9 },
  legs: { pairs: 2, length: 1, thickness: 0.15 },
  neck: { length: 0.4, thickness: 0.25, rise: 30 },
  head: { length: 0.6, height: 0.4, width: 0.35 },
  tail: { length: 0.6, thickness: 0.08, segments: 2, droop: 0.4 },
  colors: { body: "#7a5a3a" },
};

const RAPTOR: BodyPlan = {
  torso: { length: 1.2, height: 0.55, width: 0.45 },
  legs: { pairs: 2, length: 0.9, thickness: 0.09, biped: true, armScale: 0.45 },
  neck: { length: 0.45, thickness: 0.12, rise: 50 },
  head: { length: 0.45, height: 0.22, width: 0.2 },
  tail: { length: 1.4, thickness: 0.16 },
  colors: { body: "#6a5040" },
};

/** A body plan's mesh in its rest pose, read back as if it were a downloaded static model. */
const asStatic = (plan: BodyPlan) => readGlbModel(encodeGlb(bodyGlbModel(plan)));

/** Joint of the given name, as model-space position. */
function jointAt(model: ReturnType<typeof autoRig>, name: string): [number, number, number] {
  const index = model.nodes.findIndex((node) => node.name === name);
  expect(index).toBeGreaterThan(0);
  let at: [number, number, number] = [0, 0, 0];
  for (let i = index; i >= 0; i = model.nodes[i]!.parent) {
    const t = model.nodes[i]!.translation;
    at = [at[0] + t[0], at[1] + t[1], at[2] + t[2]];
  }
  return at;
}

describe("autoRig", () => {
  test("a quadruped gets four legs at its corners, a neck in front and a tail behind", () => {
    const rigged = autoRig(asStatic(COW), { shape: "quadruped" });
    const legs = ["leg_0_l", "leg_0_r", "leg_1_l", "leg_1_r"].map((name) => jointAt(rigged, name));
    // Back pair behind the front pair, left legs on -x.
    expect(legs[0]![2]).toBeLessThan(legs[2]![2]);
    expect(legs[0]![0]).toBeLessThan(0);
    expect(legs[1]![0]).toBeGreaterThan(0);
    // Hips sit near the belly, not on the ground or over the back.
    for (const leg of legs) expect(leg[1]).toBeGreaterThan(0.7);
    expect(jointAt(rigged, "neck")[2]).toBeGreaterThan(legs[2]![2]);
    expect(jointAt(rigged, "tail_0")[2]).toBeLessThan(legs[0]![2]);
    expect(rigged.clips.map((clip) => clip.name)).toEqual(["Idle", "Walk", "Run", "Attack", "Death"]);
  });

  test("every vertex is fully weighted, feet ride their own leg and the snout rides the neck", () => {
    const rigged = autoRig(asStatic(COW), { shape: "quadruped" });
    const mesh = rigged.nodes.find((node) => node.name === "mesh")!;
    const joints = rigged.skins![0]!.joints;
    let footChecked = 0;
    let snoutChecked = 0;
    for (const prim of mesh.primitives) {
      const count = prim.positions.length / 3;
      for (let v = 0; v < count; v += 1) {
        const w = [0, 1, 2, 3].map((k) => prim.skin!.weights[v * 4 + k]!);
        expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 4);
        const main = rigged.nodes[joints[prim.skin!.joints[v * 4]!]!]!.name;
        const y = prim.positions[v * 3 + 1]!;
        const x = prim.positions[v * 3]!;
        const z = prim.positions[v * 3 + 2]!;
        if (y < 0.2) {
          expect(main.startsWith("leg_")).toBe(true);
          expect(main.endsWith(x < 0 ? "_l" : "_r")).toBe(true);
          footChecked += 1;
        }
        if (z > 1.5) {
          expect(main).toBe("neck");
          snoutChecked += 1;
        }
      }
    }
    expect(footChecked).toBeGreaterThan(10);
    expect(snoutChecked).toBeGreaterThan(10);
  });

  test("a model facing +x is turned to face +z", () => {
    const source = asStatic(COW);
    const turned = { ...source, primitives: source.primitives.map((prim) => {
      const positions = new Float32Array(prim.positions);
      const normals = new Float32Array(prim.normals);
      for (let i = 0; i < positions.length; i += 3) {
        // Face +x: forward (z) becomes x.
        [positions[i], positions[i + 2]] = [prim.positions[i + 2]!, -prim.positions[i]!];
        [normals[i], normals[i + 2]] = [prim.normals[i + 2]!, -prim.normals[i]!];
      }
      return { ...prim, positions, normals };
    }) };
    const rigged = autoRig(turned, { shape: "quadruped", facing: "+x" });
    expect(jointAt(rigged, "neck")[2]).toBeGreaterThan(0.5);
    expect(Math.abs(jointAt(rigged, "neck")[0])).toBeLessThan(0.01);
  });

  test("a biped gets one pair of legs under its hips and a long tail", () => {
    const rigged = autoRig(asStatic(RAPTOR), { shape: "biped" });
    expect(rigged.nodes.filter((node) => node.name.startsWith("leg_")).map((node) => node.name)).toEqual(["leg_0_l", "leg_0_r"]);
    expect(rigged.nodes.filter((node) => node.name.startsWith("tail_"))).toHaveLength(3);
  });

  test("the rigged model encodes to a skinned GLB that reads back with its clips", () => {
    const bytes = encodeGlb(autoRig(asStatic(COW), { shape: "quadruped" }));
    const back = readGlbModel(bytes);
    expect(back.animated).toBe(true);
    expect(back.primitives.length).toBeGreaterThan(0);
  });
});
