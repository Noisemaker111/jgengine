import { afterEach, expect, spyOn, test } from "bun:test";

import { setGameAssetFiles } from "@jgengine/core/assets/assetBase";
import { modelLoadIdleMs, modelLoadStarts } from "@jgengine/core/model/modelLoad.draw";
import { BuiltLodMetaLoader } from "./builtLods.draw";

afterEach(() => {
  setGameAssetFiles(null);
});

test("LOD metadata keeps scene loading busy until its result reaches the model", async () => {
  let answer: ((response: Response) => void) | undefined;
  const pending = new Promise<Response>((resolve) => { answer = resolve; });
  const request = spyOn(globalThis, "fetch").mockImplementation(() => pending);
  const starts = modelLoadStarts();
  try {
    const loaded = new Promise<void>((resolve) => {
      new BuiltLodMetaLoader().load("/tree.glb.lods/meta.json", (meta) => {
        expect(meta).toBeNull();
        expect(modelLoadIdleMs()).toBe(0);
        resolve();
      });
    });
    expect(modelLoadStarts()).toBe(starts + 1);
    expect(modelLoadIdleMs()).toBe(0);
    answer?.(new Response("not found", { status: 404 }));
    await loaded;
  } finally {
    request.mockRestore();
  }
});

test("a listed absence also stays loading until the suspended model gets its answer", async () => {
  setGameAssetFiles("games/test", []);
  const starts = modelLoadStarts();
  const loaded = new Promise<void>((resolve) => {
    new BuiltLodMetaLoader().load("/tree.glb.lods/meta.json", (meta) => {
      expect(meta).toBeNull();
      expect(modelLoadIdleMs()).toBe(0);
      resolve();
    });
  });
  expect(modelLoadStarts()).toBe(starts + 1);
  expect(modelLoadIdleMs()).toBe(0);
  await loaded;
});
