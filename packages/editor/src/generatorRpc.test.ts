import { describe, expect, test } from "bun:test";

import { defineGenerator, registerGenerator } from "@jgengine/core/generator/generator";
import { defineParamSchema, parseParams } from "@jgengine/core/generator/paramSchema";
import { PARTS_OUTPUT, partsBounds } from "@jgengine/core/scene/assetGenerator";
import { registerSceneKind } from "@jgengine/core/scene/sceneKinds";

import { decodeEditorBridgeRequest } from "./mcp/rpcRequest";
import { EDITOR_MCP_TOOLS } from "./mcp/tools";
import { createEditorHost, type EditorBridgeResponse } from "./session";

const FIELD_SCHEMA = defineParamSchema({
  fields: [
    { type: "range", key: "density", label: "Density", group: "look", min: 0, max: 1, step: 0.01, default: 0.5 },
    { type: "bool", key: "flowers", default: false },
    { type: "seed", key: "seed", default: "" },
  ],
  presets: [{ id: "lush", values: { density: 0.9 } }],
});

registerGenerator(
  defineGenerator({
    id: "test_rpc_meadow",
    label: "Test meadow",
    schema: FIELD_SCHEMA,
    output: "test-field",
    lods: [1, 0.5],
    generate: (params, context) => ({ blades: Math.round(params.density * 100 * context.detail), roll: context.random()() }),
  }),
);

registerSceneKind({ kind: "test_rpc_field", target: "volume", label: "Test field", schema: FIELD_SCHEMA, generator: "test_rpc_meadow" });

registerGenerator(
  defineGenerator({
    id: "test_rpc_crate",
    label: "Test crate",
    schema: defineParamSchema({ fields: [{ type: "range", key: "width", min: 0.5, max: 4, step: 0.1, default: 1 }] }),
    output: PARTS_OUTPUT,
    generate: (params) => {
      const parts = [{ id: "body", position: [0, 0.5, 0] as const, size: [params.width, 1, 1] as const }];
      return { parts, bounds: partsBounds(parts) };
    },
  }),
);

const host = () =>
  createEditorHost({
    gameId: "test",
    layers: {
      volumes: [
        {
          id: "meadow",
          kind: "test_rpc_field",
          shape: "box",
          center: { x: 0, y: 0, z: 0 },
          halfExtents: { x: 10, y: 1, z: 10 },
          meta: { density: 0.3, seed: "m1" },
        },
      ],
      markers: [
        { id: "crate", kind: "prop", position: { x: 4, y: 0, z: 2 }, meta: { assetId: "test_rpc_crate", width: 2 } },
        { id: "plain", kind: "prop", position: { x: 0, y: 0, z: 0 } },
      ],
    },
  });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resultOf(response: EditorBridgeResponse): Record<string, unknown> {
  if (!response.ok || !isRecord(response.result)) throw new Error(`expected ok result, got ${JSON.stringify(response)}`);
  return response.result;
}

function recordsAt(record: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = record[key];
  if (!Array.isArray(value)) throw new Error(`expected ${key} to be an array`);
  return value.filter(isRecord);
}

function recordAt(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  if (!isRecord(value)) throw new Error(`expected ${key} to be an object`);
  return value;
}

describe("generator RPC verbs", () => {
  test("list_generators lists registered generators with fields, presets and lods", () => {
    const { api, dispose } = host();
    const generators = recordsAt(resultOf(api.handle({ method: "list_generators" })), "generators");
    const meadow = generators.find((entry) => entry["id"] === "test_rpc_meadow");
    expect(meadow).toEqual({
      id: "test_rpc_meadow",
      label: "Test meadow",
      output: "test-field",
      fields: [
        { key: "density", type: "range", label: "Density", group: "look" },
        { key: "flowers", type: "bool" },
        { key: "seed", type: "seed" },
      ],
      presets: ["lush"],
      lods: [1, 0.5],
    });
    const parts = recordsAt(resultOf(api.handle({ method: "list_generators", output: PARTS_OUTPUT })), "generators");
    expect(parts.some((entry) => entry["id"] === "test_rpc_crate")).toBe(true);
    expect(parts.some((entry) => entry["id"] === "test_rpc_meadow")).toBe(false);
    dispose();
  });

  test("generator_variants is deterministic, returns count variants and starts at the current params", () => {
    const { api, dispose } = host();
    const first = resultOf(api.handle({ method: "generator_variants", id: "meadow", count: 8, explore: 0.4 }));
    const again = resultOf(api.handle({ method: "generator_variants", id: "meadow", count: 8, explore: 0.4 }));
    expect(first).toEqual(again);
    expect(first["generator"]).toBe("test_rpc_meadow");
    const variants = recordsAt(first, "variants");
    expect(variants).toHaveLength(8);
    expect(variants.map((variant) => variant["index"])).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    const base = recordAt(variants[0] ?? {}, "meta");
    expect(parseParams(FIELD_SCHEMA, base)).toEqual(parseParams(FIELD_SCHEMA, { density: 0.3, seed: "m1" }));
    expect(variants[0]?.["seed"]).toBe("m1");
    expect(new Set(variants.map((variant) => variant["seed"])).size).toBe(8);
    const otherGrid = resultOf(api.handle({ method: "generator_variants", id: "meadow", count: 8, explore: 0.4, seed: "other" }));
    expect(recordsAt(otherGrid, "variants")[1]).not.toEqual(variants[1]);
    dispose();
  });

  test("generator_variants caps count, pins kept bags and works from a generator id alone", () => {
    const { api, dispose } = host();
    expect(recordsAt(resultOf(api.handle({ method: "generator_variants", id: "meadow", count: 500 })), "variants")).toHaveLength(64);
    const kept = recordsAt(resultOf(api.handle({ method: "generator_variants", id: "meadow", count: 3, keep: [{ density: 0.8, seed: "kept" }] })), "variants");
    expect(kept[0]?.["seed"]).toBe("kept");
    expect(kept[1]?.["seed"]).toBe("m1");
    const byGenerator = resultOf(api.handle({ method: "generator_variants", generator: "test_rpc_crate", count: 4 }));
    expect(recordsAt(byGenerator, "variants")).toHaveLength(4);
    const fromMarker = resultOf(api.handle({ method: "generator_variants", id: "crate", count: 2 }));
    expect(fromMarker["generator"]).toBe("test_rpc_crate");
    dispose();
  });

  test("apply_variant writes the variant's params and seed as one undoable edit", () => {
    const { api, dispose } = host();
    const grid = recordsAt(resultOf(api.handle({ method: "generator_variants", id: "meadow", count: 6, explore: 0.5 })), "variants");
    const wanted = recordAt(grid[4] ?? {}, "meta");
    const applied = resultOf(api.handle({ method: "apply_variant", id: "meadow", index: 4, count: 6, explore: 0.5 }));
    expect(applied["index"]).toBe(4);
    expect(applied["seed"]).toBe(wanted["seed"]);
    const volume = resultOf(api.handle({ method: "get_volume", id: "meadow" }));
    expect(recordAt(volume, "meta")).toEqual({ density: wanted["density"], flowers: wanted["flowers"], seed: wanted["seed"] });
    expect(api.handle({ method: "undo" }).ok).toBe(true);
    expect(recordAt(resultOf(api.handle({ method: "get_volume", id: "meadow" })), "meta")).toEqual({ density: 0.3, seed: "m1" });
    dispose();
  });

  test("apply_variant takes a held variant meta and keeps non-schema keys like assetId", () => {
    const { api, dispose } = host();
    const applied = resultOf(api.handle({ method: "apply_variant", id: "crate", meta: { width: 3.5, seed: "picked", assetId: "elsewhere" } }));
    expect(applied["index"]).toBeNull();
    expect(recordAt(resultOf(api.handle({ method: "get_marker", id: "crate" })), "meta")).toEqual({ assetId: "test_rpc_crate", width: 3.5, seed: "picked" });
    const bad = api.handle({ method: "apply_variant", id: "crate", meta: { width: 99 } });
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain("width");
    dispose();
  });

  test("place_variant adds an offset copy carrying the variant meta, undoable", () => {
    const { api, dispose } = host();
    const placed = resultOf(api.handle({ method: "place_variant", id: "crate", index: 2, count: 4, dx: 3, dz: -1 }));
    const placedId = placed["id"];
    expect(placedId).toBe("crate_v2");
    const marker = resultOf(api.handle({ method: "get_marker", id: "crate_v2" }));
    expect(marker["position"]).toEqual({ x: 7, y: 0, z: 1 });
    expect(marker["kind"]).toBe("prop");
    const meta = recordAt(marker, "meta");
    expect(meta["assetId"]).toBe("test_rpc_crate");
    expect(meta["seed"]).toBe(placed["seed"]);
    expect(api.handle({ method: "undo" }).ok).toBe(true);
    expect(api.handle({ method: "get_marker", id: "crate_v2" }).ok).toBe(false);
    dispose();
  });

  test("errors name an unknown object, a missing generator, a bad index and a missing pick", () => {
    const { api, dispose } = host();
    const unknown = api.handle({ method: "generator_variants", id: "nope" });
    expect(unknown.ok).toBe(false);
    expect(unknown.error).toContain("object not found");
    const none = api.handle({ method: "apply_variant", id: "plain", index: 0 });
    expect(none.ok).toBe(false);
    expect(none.error).toContain("has no generator");
    expect(api.handle({ method: "apply_variant", id: "nope", index: 0 }).ok).toBe(false);
    const range = api.handle({ method: "apply_variant", id: "meadow", index: 20, count: 5 });
    expect(range.ok).toBe(false);
    expect(range.error).toContain("0..4");
    expect(api.handle({ method: "apply_variant", id: "meadow" }).error).toContain("requires index");
    expect(api.handle({ method: "generator_variants" }).ok).toBe(false);
    expect(api.handle({ method: "generator_variants", generator: "missing" }).error).toContain("unknown generator");
    expect(api.handle({ method: "generator_variants", id: "meadow", generator: "test_rpc_crate" }).ok).toBe(false);
    dispose();
  });

  test("the verbs are decodable RPC methods and listed MCP tools", () => {
    expect(decodeEditorBridgeRequest({ method: "generator_variants", id: "meadow", count: 4, keep: [{ seed: "a" }] }).ok).toBe(true);
    expect(decodeEditorBridgeRequest({ method: "apply_variant", id: "meadow", index: "1" }).ok).toBe(false);
    const names = EDITOR_MCP_TOOLS.map((tool) => tool.name);
    for (const name of ["list_generators", "generator_variants", "apply_variant", "place_variant"]) expect(names).toContain(name);
  });
});
