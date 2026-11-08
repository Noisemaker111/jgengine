import { expect, test } from "bun:test";
import { bakeDecal } from "./decalBakePool";
import { bakeDecalTexture, createDecalTexture } from "./decalTexture";

test("a worker bakes the same bytes the main thread would, and keeps them for the next mount", async () => {
  const paint = { text: "LINE 06", color: "#336699" };
  const baked = await bakeDecal("stencil", "pool-a", 64, paint);
  expect(baked.data).toEqual(bakeDecalTexture("stencil", "pool-a", 64, paint).data);
  // Kept: the synchronous path and a second bake both hand back the worker's bytes.
  expect(createDecalTexture("stencil", "pool-a", 64, paint)).toBe(baked);
  expect(await bakeDecal("stencil", "pool-a", 64, paint)).toBe(baked);
});

test("looks baked at once are each baked once, in any order", async () => {
  const looks = ["rust", "grime", "leak", "dirt", "rust"] as const;
  const baked = await Promise.all(looks.map((style) => bakeDecal(style, "pool-b", 32)));
  expect(baked[4]).toBe(baked[0]!);
  looks.forEach((style, index) => expect(baked[index]!.data).toEqual(bakeDecalTexture(style, "pool-b", 32, {}).data));
});
