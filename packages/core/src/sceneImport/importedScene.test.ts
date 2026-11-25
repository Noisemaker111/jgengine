import { describe, expect, test } from "bun:test";

import { mirrorMatrixX, parseImportedSceneFile, planImportedScene } from "./importedScene";
import { syntheticScene } from "./testFixtures/syntheticScene";

/** Column-major 4x4 times a point. */
function transform(matrix: ArrayLike<number>, offset: number, point: readonly [number, number, number]): [number, number, number] {
  const [x, y, z] = point;
  return [0, 1, 2].map((row) => matrix[offset + row]! * x + matrix[offset + 4 + row]! * y + matrix[offset + 8 + row]! * z + matrix[offset + 12 + row]!) as [number, number, number];
}

const close = (values: readonly number[]) => values.map((value) => Math.round(value * 1e6) / 1e6 + 0);

describe("scene.json", () => {
  test("names the first wrong field", () => {
    const good = { center: [0, 0], radius: 10, materials: { a: { texture: "textures/a.png" } }, instances: [{ mesh: "meshes/a.obj", meshName: "a", matrix: Array.from({ length: 16 }, () => 0), materials: ["a"] }] };
    expect(parseImportedSceneFile(good).handedness).toBe("left");
    expect(() => parseImportedSceneFile({ ...good, center: [0] })).toThrow("center must be [x, z]");
    expect(() => parseImportedSceneFile({ ...good, instances: [{ ...good.instances[0], matrix: [1, 2] }] })).toThrow("instances[0].matrix must be 16 numbers");
    expect(() => parseImportedSceneFile({ ...good, instances: [{ ...good.instances[0], mesh: "" }] })).toThrow("instances[0].mesh must be a non-empty string");
    expect(() => parseImportedSceneFile({ ...good, materials: { a: { texture: 3 } } })).toThrow("materials.a.texture must be a non-empty string");
    expect(() => parseImportedSceneFile({ ...good, handedness: "up" })).toThrow(`handedness must be "left" or "right"`);
  });
});

describe("scene plan", () => {
  test("a left-handed placement lands where the source tool drew it, mirrored across X", () => {
    // Unity: a mesh-local point (1, 2, 3), rotated 90 degrees about Y, scaled 2, moved to (10, 0, 20).
    const unity = [0, 0, -2, 0, 0, 2, 0, 0, 2, 0, 0, 0, 10, 0, 20, 1];
    const unityWorld = transform(unity, 0, [1, 2, 3]);
    expect(unityWorld).toEqual([16, 4, 18]);
    const plan = planImportedScene(parseImportedSceneFile({
      center: [4, -6], radius: 100, materials: {},
      instances: [{ mesh: "m.obj", meshName: "m", matrix: unity, materials: [] }],
    }));
    // The OBJ holds the point with X negated; the engine draws Unity's world point with X negated.
    const local = transform(plan.batches[0]!.matrices, 0, [-1, 2, 3]);
    const world = [local[0] + plan.origin[0], local[1] + plan.origin[1], local[2] + plan.origin[2]];
    expect(close(world)).toEqual([-16, 4, 18]);
    expect(plan.origin).toEqual([-4, 0, -6]);
    expect(plan.batches[0]!.mirrored).toBe(false);
    const right = planImportedScene(parseImportedSceneFile({ center: [0, 0], radius: 100, materials: {}, handedness: "right", instances: [{ mesh: "m.obj", meshName: "m", matrix: unity, materials: [] }] }));
    expect(Array.from(right.batches[0]!.matrices)).toEqual(unity);
  });

  test("mirroring twice gives the matrix back", () => {
    const source = Array.from({ length: 16 }, (_, index) => index + 1);
    const once: number[] = [];
    const twice: number[] = [];
    mirrorMatrixX(source, once);
    mirrorMatrixX(once, twice);
    expect(twice).toEqual(source);
    expect(once.slice(0, 4)).toEqual([1, -2, -3, -4]);
    expect([once[4], once[8], once[12]]).toEqual([-5, -9, -13]);
  });

  test("groups 20,000 instances into one batch per distinct mesh at the target scale", () => {
    const generated = syntheticScene({ instances: 20_000, meshes: 4_600, textures: 1_500 });
    const plan = planImportedScene(parseImportedSceneFile(JSON.parse(JSON.stringify(generated.scene))));
    expect(plan.instances).toBe(20_000);
    expect(plan.skipped).toBe(0);
    expect(plan.meshFiles.length).toBe(4_600);
    // Each mesh keeps one material list; a mesh placed both mirrored and not takes a second, rewound batch.
    const meshesWithMirror = new Set(plan.batches.filter((batch) => batch.mirrored).map((batch) => batch.mesh));
    const mirroredOnly = [...meshesWithMirror].filter((mesh) => plan.batches.every((batch) => batch.mesh !== mesh || batch.mirrored)).length;
    expect(plan.batches.length).toBe(4_600 + meshesWithMirror.size - mirroredOnly);
    expect(plan.batches.filter((batch) => batch.mirrored).reduce((sum, batch) => sum + batch.count, 0)).toBe(generated.mirrored);
    expect(plan.batches.reduce((sum, batch) => sum + batch.count, 0)).toBe(20_000);
    expect(plan.textures.length).toBeLessThanOrEqual(1_500);
    expect(new Set(plan.textures).size).toBe(plan.textures.length);
    // Every converted instance is the source instance mirrored across X, relative to the centre.
    const first = plan.batches.find((batch) => batch.mesh === generated.scene.instances[0]!.mesh && !batch.mirrored)!;
    const source = generated.scene.instances[0]!.matrix;
    const expected = transform(source, 0, [1, 1, 1]);
    const got = transform(first.matrices, 0, [-1, 1, 1]);
    expect(close([got[0] + plan.origin[0], got[1], got[2] + plan.origin[2]])).toEqual(close([-expected[0], expected[1], expected[2]]));
  });

  test("leaves out instances beyond the radius", () => {
    const at = (x: number, z: number) => ({ mesh: "m.obj", meshName: "m", matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, z, 1], materials: [] });
    const plan = planImportedScene(parseImportedSceneFile({ center: [100, 100], radius: 50, materials: {}, instances: [at(100, 149), at(100, 151), at(140, 140)] }));
    expect(plan.instances).toBe(1);
    expect(plan.skipped).toBe(2);
  });
});
