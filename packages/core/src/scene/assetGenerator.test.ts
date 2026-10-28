import { describe, expect, test } from "bun:test";

import { listGenerators, registerGenerator } from "../generator/generator";
import { PARTS_OUTPUT, partsBounds, placedGeneratorFor, resolveGeneratorAsset, type GeneratedAsset } from "./assetGenerator";
import { registerBuiltinSceneKinds } from "./builtinSceneKinds";
import type { ParamSchema } from "../generator/paramSchema";

const SCHEMA: ParamSchema = {
  fields: [
    { type: "range", key: "width", min: 1, max: 4, step: 0.1, default: 2 },
    { type: "seed", key: "seed", default: "" },
  ],
};

registerGenerator({
  id: "test_box",
  label: "Test box",
  output: PARTS_OUTPUT,
  schema: SCHEMA,
  generate: (params): GeneratedAsset => {
    const width = params["width"] as number;
    const parts = [{ id: "b", position: [0, 0.5, 0] as const, size: [width, 1, 1] as const }];
    return { parts, bounds: partsBounds(parts) };
  },
});

describe("asset generator registry", () => {
  test("registers and lists a generator", () => {
    expect(placedGeneratorFor({ assetId: "test_box" })?.label).toBe("Test box");
    expect(listGenerators(PARTS_OUTPUT).some((generator) => generator.id === "test_box")).toBe(true);
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

  test("ignores generators of another output family", () => {
    registerGenerator({ id: "test_field", label: "Field", output: "field", schema: { fields: [] }, generate: () => ({ parts: [], bounds: { min: [0, 0, 0], max: [0, 0, 0] } }) });
    expect(placedGeneratorFor({ assetId: "test_field" })).toBeUndefined();
    expect(resolveGeneratorAsset({ assetId: "test_field" })).toBeNull();
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
