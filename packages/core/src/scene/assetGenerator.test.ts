import { describe, expect, test } from "bun:test";

import {
  getAssetGenerator,
  listAssetGenerators,
  partsBounds,
  registerAssetGenerator,
  resolveGeneratorAsset,
  type GeneratedAsset,
} from "./assetGenerator";
import { registerBuiltinSceneKinds } from "./builtinSceneKinds";
import type { ParamSchema } from "./sceneKinds";

const SCHEMA: ParamSchema = {
  fields: [
    { type: "range", key: "width", min: 1, max: 4, step: 0.1, default: 2 },
    { type: "seed", key: "seed", default: "" },
  ],
};

registerAssetGenerator({
  id: "test_box",
  label: "Test box",
  schema: SCHEMA,
  generate: (params): GeneratedAsset => {
    const width = params["width"] as number;
    const parts = [{ id: "b", position: [0, 0.5, 0] as const, size: [width, 1, 1] as const }];
    return { parts, bounds: partsBounds(parts) };
  },
});

describe("asset generator registry", () => {
  test("registers and lists a generator", () => {
    expect(getAssetGenerator("test_box")?.label).toBe("Test box");
    expect(listAssetGenerators().some((generator) => generator.id === "test_box")).toBe(true);
  });

  test("resolveGeneratorAsset parses params off meta and generates", () => {
    const resolved = resolveGeneratorAsset({ assetId: "test_box", width: 3 });
    expect(resolved).not.toBeNull();
    expect(resolved!.parts[0]!.size[0]).toBe(3);
    expect(resolved!.bounds.max[0]).toBeCloseTo(1.5);
  });

  test("clamps params from the schema", () => {
    const resolved = resolveGeneratorAsset({ assetId: "test_box", width: 99 });
    expect(resolved!.parts[0]!.size[0]).toBe(4);
  });

  test("returns null for an unknown or missing assetId", () => {
    expect(resolveGeneratorAsset({ assetId: "nope" })).toBeNull();
    expect(resolveGeneratorAsset(undefined)).toBeNull();
  });
});

describe("building generator adopter", () => {
  test("is registered by the built-ins and produces parts", () => {
    registerBuiltinSceneKinds();
    const resolved = resolveGeneratorAsset({ assetId: "building", floors: 3, baysWide: 2, baysDeep: 2, seed: "x" });
    expect(resolved).not.toBeNull();
    expect(resolved!.parts.length).toBeGreaterThan(0);
    expect(resolved!.parts.every((part) => part.size.length === 3)).toBe(true);
    // Deterministic for the same seed.
    const again = resolveGeneratorAsset({ assetId: "building", floors: 3, baysWide: 2, baysDeep: 2, seed: "x" });
    expect(again!.parts.length).toBe(resolved!.parts.length);
  });
});
