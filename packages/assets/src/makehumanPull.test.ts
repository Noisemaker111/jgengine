import { describe, expect, test } from "bun:test";

import { assetLibrary } from "./library/libraryIndex";
import { MAKEHUMAN_PRESETS, makehumanPreset } from "./library/libraryMakehuman";
import { libraryServedPath } from "./library/libraryServed";
import { applyTarget, makehumanBoneName, makehumanSkinTone, makehumanTargets, parseObj } from "./makehumanPull";

describe("MakeHuman people", () => {
  test("a preset sums its ethnic gender-age targets, blended by age, plus a body target off average", () => {
    const young = makehumanTargets({ id: "a", title: "A", gender: "male", age: 0, ethnicity: { african: 0, asian: 0, caucasian: 1 }, tags: [] });
    expect(young).toEqual([{ path: "targets/macrodetails/caucasian-male-young.target", weight: 1 }]);
    const mixed = makehumanTargets({ id: "b", title: "B", gender: "female", age: 0.25, ethnicity: { african: 1, asian: 0, caucasian: 1 }, muscle: "max", tags: [] });
    expect(mixed).toEqual([
      { path: "targets/macrodetails/african-female-young.target", weight: 0.375 },
      { path: "targets/macrodetails/african-female-old.target", weight: 0.125 },
      { path: "targets/macrodetails/caucasian-female-young.target", weight: 0.375 },
      { path: "targets/macrodetails/caucasian-female-old.target", weight: 0.125 },
      { path: "targets/macrodetails/universal-female-young-maxmuscle-averageweight.target", weight: 0.75 },
      { path: "targets/macrodetails/universal-female-old-maxmuscle-averageweight.target", weight: 0.25 },
    ]);
  });

  test("targets add weighted offsets by vertex index, skipping comments", () => {
    const positions = new Float32Array([0, 0, 0, 1, 1, 1]);
    applyTarget(positions, "# header\n1 .5 -1 2\n9 1 1 1\n", 0.5);
    expect([...positions]).toEqual([0, 0, 0, 1.25, 0.5, 2]);
  });

  test("OBJ groups, UVs and quads parse into faces", () => {
    const mesh = parseObj("v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nvt 0 0\nvt 1 1\ng body\nf 1/1 2/2 3/1 4/2\ng helper\nf 1 2 3\n");
    expect(mesh.positions).toHaveLength(12);
    expect(mesh.faces).toEqual([
      { group: "body", verts: [0, 1, 2, 3], uvs: [0, 1, 0, 1] },
      { group: "helper", verts: [0, 1, 2], uvs: [-1, -1, -1] },
    ]);
  });

  test("bone names lose their dots and skin tones blend by ethnicity", () => {
    expect(makehumanBoneName("upperarm01.L")).toBe("upperarm01_L");
    const dark = makehumanSkinTone({ african: 1, asian: 0, caucasian: 0 });
    const light = makehumanSkinTone({ african: 0, asian: 0, caucasian: 1 });
    expect(dark.r).toBeLessThan(light.r);
  });

  test("every pinned person is a CC0 rigged character with its own served model", () => {
    const people = assetLibrary().filter((entry) => entry.source === "makehuman");
    expect(people.map((entry) => entry.id)).toEqual(MAKEHUMAN_PRESETS.map((preset) => preset.id));
    for (const entry of people) {
      expect(entry).toMatchObject({ kind: "character", license: "CC0-1.0", rigged: true });
      expect(entry.tags).toEqual(expect.arrayContaining(["human", "idle", "walk", "run"]));
      expect(makehumanPreset(entry.id)).toBeDefined();
      expect(libraryServedPath(entry).url).toBe(`/models/library/makehuman/${entry.id}/model.glb`);
    }
  });
});
