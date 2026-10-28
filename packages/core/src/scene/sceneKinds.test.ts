import { describe, expect, test } from "bun:test";

import { definePlaceableMarkerKind, getSceneKind, isSceneKind, listSceneKinds, parseSceneKindParams, registerSceneKind } from "./sceneKinds";
import { defaultParamMeta, parseParams, type ParamSchema } from "../generator/paramSchema";
import { registerBuiltinSceneKinds, SCATTER_SCHEMA } from "./builtinSceneKinds";

const TEST_SCHEMA: ParamSchema = {
  fields: [
    { type: "range", key: "density", label: "density", min: 0, max: 2, step: 0.1, default: 0.5 },
    { type: "number", key: "count", default: 3, min: 0 },
    { type: "bool", key: "align", default: false },
    { type: "select", key: "mode", options: [{ value: "a" }, { value: "b" }], default: "a" },
    { type: "color", key: "tint", default: "#fff" },
    { type: "seed", key: "seed", default: "" },
    { type: "weightedList", key: "palette", default: [{ item: "grass", weight: 1 }] },
  ],
};

describe("registry", () => {
  test("registers, looks up, and lists by target", () => {
    registerSceneKind({ kind: "test_marker_kind", target: "marker", label: "Test", schema: TEST_SCHEMA });
    expect(isSceneKind("test_marker_kind")).toBe(true);
    expect(getSceneKind("test_marker_kind")?.label).toBe("Test");
    expect(listSceneKinds("marker").some((definition) => definition.kind === "test_marker_kind")).toBe(true);
    expect(listSceneKinds("path").some((definition) => definition.kind === "test_marker_kind")).toBe(false);
  });

  test("parseSceneKindParams returns null for unregistered kinds", () => {
    expect(parseSceneKindParams({ id: "x", kind: "not_a_studio" })).toBeNull();
  });

  test("definePlaceableMarkerKind registers a click-to-place marker kind in one call", () => {
    const kind = definePlaceableMarkerKind({
      kind: "test_stash",
      label: "Test Stash",
      category: "My Game",
      accent: "#38d6c4",
      fields: [{ type: "number", key: "value", label: "Payout", default: 300, min: 0 }],
    });
    expect(kind).toBe("test_stash");
    const definition = getSceneKind("test_stash");
    expect(definition?.target).toBe("marker");
    expect(definition?.label).toBe("Test Stash");
    // addCategory is what surfaces it as a click-to-place tool in the + Add menu.
    expect(definition?.addCategory).toBe("My Game");
    expect(definition?.accent).toBe("#38d6c4");
    // The inspector fields round-trip, so a placed marker gets a payout default in its meta.
    expect(defaultParamMeta(definition!.schema)).toEqual({ value: 300 });
  });

  test("definePlaceableMarkerKind defaults the menu category to Custom and needs no fields", () => {
    definePlaceableMarkerKind({ kind: "test_bare", label: "Bare" });
    expect(getSceneKind("test_bare")?.addCategory).toBe("Custom");
    expect(getSceneKind("test_bare")?.schema.fields).toEqual([]);
  });
});

describe("built-in kinds", () => {
  test("registers the engine environment kinds scatter and water", () => {
    registerBuiltinSceneKinds();
    expect(getSceneKind("scatter")?.target).toBe("path");
    expect(getSceneKind("water")?.target).toBe("volume");
    expect(getSceneKind("pole_line")?.target).toBe("path");
    // Domain studios (bookcase, …) are NOT built in — proven by scripts/studioSeam.test.ts
    // (no engine file references them); they register from example/game code via the public seam.
  });

  test("scatter schema parses density from meta", () => {
    const params = parseParams(SCATTER_SCHEMA, { density: 0.9 });
    expect(params["density"]).toBe(0.9);
  });

  test("scatter note reports an estimate for a closed region", () => {
    registerBuiltinSceneKinds();
    const scatter = getSceneKind("scatter")!;
    const note = scatter.note!(
      { id: "r", kind: "scatter", points: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 0, z: 10 }, { x: 0, y: 0, z: 10 }] },
      parseParams(scatter.schema, { density: 0.5 }),
    );
    expect(note).toContain("placements");
  });
});
