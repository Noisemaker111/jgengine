import { expect, test } from "bun:test";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { modelAssetRequests, modelMapEntries } from "./modelAssets";

test("composed dependencies start in parallel with the exact cache keys material application consumes", () => {
  const maps = { normal: "/normal.png", color: "/color.png", roughness: "/rough.png" };
  const hand: ModelConfig = { url: "/hand.glb", material: { maps } };
  const arm: ModelConfig = { url: "/arm.glb", parts: [{ model: hand }] };
  const model: ModelConfig = {
    url: "/body.glb",
    material: { maps },
    parts: [{ model: arm }, { model: hand }, { model: "unresolved-reference" }],
    attachments: [{ slot: "head", model: { url: "/hat.glb", material: { maps: { color: "/hat.png" } } } }],
  };
  expect(modelMapEntries(maps)).toEqual({ color: "/color.png", normal: "/normal.png", roughness: "/rough.png" });
  expect(modelAssetRequests(model)).toEqual({
    models: ["/body.glb", "/arm.glb", "/hand.glb", "/hat.glb"],
    textureGroups: [["/color.png", "/normal.png", "/rough.png"], ["/hat.png"]],
  });
});

test("reused or cyclic compositions terminate and share requests without caching stale runtime configuration", () => {
  const model: ModelConfig = { url: "/body.glb" };
  model.parts = [{ model }, { model: { url: "/body.glb" } }];
  expect(modelAssetRequests(model)).toEqual({ models: ["/body.glb"], textureGroups: [] });
  model.material = { maps: { color: "/new.png" } };
  expect(modelAssetRequests(model).textureGroups).toEqual([["/new.png"]]);
});

test("only assigned material assets request maps from a shared material library", () => {
  const model: ModelConfig = { url: "/model.glb", materialAssets: [
    { schemaVersion: 1, id: "used", name: "used", family: "stone", capabilities: ["pbr"], surface: {}, textures: { color: { url: "/used.png", colorSpace: "srgb" } } },
    { schemaVersion: 1, id: "unused", name: "unused", family: "stone", capabilities: ["pbr"], surface: {}, textures: { color: { url: "/unused.png", colorSpace: "srgb" } } },
  ], materialAssignments: [{ materialId: "used", selector: { mesh: "stone" } }] };
  expect(modelAssetRequests(model).textureGroups).toEqual([["/used.png"]]);
  model.materialAssignments = [];
  expect(modelAssetRequests(model).textureGroups).toEqual([]);
});
