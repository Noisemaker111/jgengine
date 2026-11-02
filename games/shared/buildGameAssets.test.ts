import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { matchPublicFiles, parseAssetBuildPlan } from "./buildGameAssets";

const directory = mkdtempSync(join(tmpdir(), "jg-asset-build-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

test("a plan reads its levels, globs and bake settings", () => {
  const plan = parseAssetBuildPlan({
    lods: { include: ["models/**/*.glb"], exclude: ["models/skip/*.glb"], levels: [{ ratio: 0.4 }, { ratio: 0.1, error: 0.03 }], minTriangles: 300 },
    impostors: { include: ["models/trees/*.glb"], frames: 6 },
  });
  expect(plan.lods?.levels).toEqual([{ ratio: 0.4 }, { ratio: 0.1, error: 0.03 }]);
  expect(plan.lods?.minTriangles).toBe(300);
  expect(plan.lods?.exclude).toEqual(["models/skip/*.glb"]);
  expect(plan.impostors).toEqual({ include: ["models/trees/*.glb"], frames: 6 });
});

test("a plan names the field that is wrong", () => {
  expect(() => parseAssetBuildPlan({ lods: { include: ["a.glb"], levels: [] } })).toThrow(/levels lists at least one/);
  expect(() => parseAssetBuildPlan({ lods: { include: ["a.glb"], levels: [{ ratio: 1.5 }] } })).toThrow(/levels\[0\]\.ratio/);
  expect(() => parseAssetBuildPlan({ lods: { include: "a.glb", levels: [{ ratio: 0.5 }] } })).toThrow(/lods\.include/);
  expect(() => parseAssetBuildPlan({ impostors: { include: [3] } })).toThrow(/impostors\.include/);
});

test("globs find model files under public, never the built folders, and honour exclusions", () => {
  const pub = join(directory, "public");
  for (const path of ["models/a/near.gltf", "models/b/near.gltf", "models/b/near.gltf.lods/lod1.glb", "models/skip/x.glb", "models/keep/y.glb"]) {
    mkdirSync(join(pub, path, ".."), { recursive: true });
    writeFileSync(join(pub, path), "");
  }
  expect(matchPublicFiles(pub, ["models/*/near.gltf"]).map((file) => file.slice(pub.length + 1))).toEqual(["models/a/near.gltf", "models/b/near.gltf"]);
  expect(matchPublicFiles(pub, ["models/**/*.glb"], ["models/skip/*.glb"]).map((file) => file.slice(pub.length + 1))).toEqual(["models/keep/y.glb"]);
});
