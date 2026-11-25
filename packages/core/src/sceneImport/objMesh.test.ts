import { describe, expect, test } from "bun:test";

import { findObjObject, parseObj } from "./objMesh";
import { syntheticObj } from "./testFixtures/syntheticScene";

const encode = (text: string) => new TextEncoder().encode(text);

function point(positions: Float32Array, index: number): [number, number, number] {
  return [positions[index * 3]!, positions[index * 3 + 1]!, positions[index * 3 + 2]!];
}

describe("OBJ reader", () => {
  test("splits objects and material runs, fans polygons and resolves relative indices", () => {
    const objects = parseObj(encode([
      "mtllib scene.mtl",
      "o crate",
      "v 0 0 0", "v 1 0 0", "v 1 1 0", "v 0 1 0",
      "vt 0 0", "vt 1 0", "vt 1 1", "vt 0 1",
      "vn 0 0 1",
      "usemtl wood",
      "f 1/1/1 2/2/1 3/3/1 4/4/1",
      "usemtl metal",
      "f -4/-4/-1 -2/-2/-1 -1/-1/-1",
      "o post",
      "v 5e-1 2.5E+0 -1.25",
      "v 1 2 3",
      "v 4 5 6",
      "f 5 6 7",
      "",
    ].join("\r\n")));
    expect(objects.map((object) => object.name)).toEqual(["crate", "post"]);
    const [wood, metal] = objects[0]!.submeshes;
    expect(wood!.material).toBe("wood");
    expect(Array.from(wood!.indices)).toEqual([0, 1, 2, 0, 2, 3]);
    expect(wood!.positions.length).toBe(12);
    expect(Array.from(wood!.uvs!)).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
    expect(metal!.material).toBe("metal");
    expect(point(metal!.positions, 1)).toEqual([1, 1, 0]);
    const post = objects[1]!.submeshes[0]!;
    expect(post.material).toBe("metal");
    expect(point(post.positions, 0)).toEqual([0.5, 2.5, -1.25]);
    expect(post.uvs).toBeNull();
    // No normals written: the face's own, (b - a) x (c - a) = (-14.25, 11.25, 3) normalized.
    expect(point(post.normals, 0).map((value) => Math.round(value * 1000) / 1000)).toEqual([-0.774, 0.611, 0.163]);
  });

  test("shares a corner written twice and splits one whose normal differs", () => {
    const [object] = parseObj(encode(["v 0 0 0", "v 1 0 0", "v 0 1 0", "vn 0 0 1", "vn 0 0 -1", "f 1//1 2//1 3//1", "f 1//2 3//2 2//2", ""].join("\n")));
    expect(object!.submeshes[0]!.positions.length).toBe(18);
    const [shared] = parseObj(encode(["v 0 0 0", "v 1 0 0", "v 0 1 0", "v 1 1 0", "f 1 2 3", "f 3 2 4", ""].join("\n")));
    expect(shared!.submeshes[0]!.positions.length).toBe(12);
  });

  test("uses groups as objects only when the file has no o lines, and finds a lone object by any name", () => {
    const grouped = parseObj(encode(["g a", "v 0 0 0", "v 1 0 0", "v 0 1 0", "f 1 2 3", "g b", "f 1 3 2", ""].join("\n")));
    expect(grouped.map((object) => object.name)).toEqual(["a", "b"]);
    const named = parseObj(encode(["o only", "g part", "v 0 0 0", "v 1 0 0", "v 0 1 0", "f 1 2 3", ""].join("\n")));
    expect(named.map((object) => object.name)).toEqual(["only"]);
    expect(findObjObject(named, "whatever")?.name).toBe("only");
    expect(findObjObject(grouped, "c")).toBeNull();
    expect(findObjObject(grouped, "b")?.name).toBe("b");
  });

  test("the generated export winds its faces outward once X is flipped", () => {
    const [object] = parseObj(encode(syntheticObj(3, 4, 6)));
    expect(object!.name).toBe("mesh_3");
    expect(object!.submeshes.map((submesh) => submesh.material)).toEqual(["part_0", "part_1"]);
    for (const submesh of object!.submeshes) {
      const { positions, normals, indices } = submesh;
      for (let face = 0; face < indices.length; face += 3) {
        const [a, b, c] = [indices[face]!, indices[face + 1]!, indices[face + 2]!].map((index) => point(positions, index));
        const ab = [b![0] - a![0], b![1] - a![1], b![2] - a![2]];
        const ac = [c![0] - a![0], c![1] - a![1], c![2] - a![2]];
        const facing = [ab[1]! * ac[2]! - ab[2]! * ac[1]!, ab[2]! * ac[0]! - ab[0]! * ac[2]!, ab[0]! * ac[1]! - ab[1]! * ac[0]!];
        const normal = point(normals, indices[face]!);
        expect(facing[0]! * normal[0] + facing[1]! * normal[1] + facing[2]! * normal[2]).toBeGreaterThan(0);
      }
    }
  });
});
