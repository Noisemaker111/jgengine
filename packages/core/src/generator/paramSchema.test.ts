import { describe, expect, test } from "bun:test";

import {
  childParamGroups,
  defaultParamMeta,
  defineParamSchema,
  jitterParams,
  parseParams,
  randomizeGroupParams,
  resetGroupParams,
  sampleCurve,
  sampleGradient,
  validateParams,
  type ParamSchema,
  type ParamsOf,
} from "./paramSchema";
import { seededRng } from "../random/rng";

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

describe("parseParams", () => {
  test("fills defaults for missing/invalid values", () => {
    const parsed = parseParams(TEST_SCHEMA, undefined);
    expect(parsed["density"]).toBe(0.5);
    expect(parsed["count"]).toBe(3);
    expect(parsed["align"]).toBe(false);
    expect(parsed["mode"]).toBe("a");
    expect(parsed["seed"]).toBe("");
    expect(parsed["palette"]).toEqual([{ item: "grass", weight: 1 }]);
  });

  test("clamps ranges and rejects unknown select options", () => {
    const parsed = parseParams(TEST_SCHEMA, { density: 9, mode: "z", align: true });
    expect(parsed["density"]).toBe(2);
    expect(parsed["mode"]).toBe("a");
    expect(parsed["align"]).toBe(true);
  });

  test("reads weighted lists, dropping empty items", () => {
    const parsed = parseParams(TEST_SCHEMA, { palette: [{ item: "tree", weight: 2 }, { item: "", weight: 5 }] });
    expect(parsed["palette"]).toEqual([{ item: "tree", weight: 2 }]);
  });
});

describe("validateParams", () => {
  test("flags out-of-range and wrong-type values", () => {
    const issues = validateParams(TEST_SCHEMA, { density: 5, align: "yes", mode: "z" });
    const keys = issues.map((issue) => issue.key).sort();
    expect(keys).toEqual(["align", "density", "mode"]);
  });

  test("passes a valid patch", () => {
    expect(validateParams(TEST_SCHEMA, { density: 1, mode: "b" })).toEqual([]);
  });
});

describe("defaultParamMeta", () => {
  test("defaultParamMeta produces a fresh, valid patch", () => {
    const meta = defaultParamMeta(TEST_SCHEMA);
    expect(validateParams(TEST_SCHEMA, meta)).toEqual([]);
  });
});

describe("group randomize / reset", () => {
  const GROUPED: ParamSchema = {
    groups: [
      { id: "shape", label: "Shape" },
      { id: "look", label: "Look" },
    ],
    fields: [
      { type: "range", key: "width", min: 1, max: 4, step: 0.1, default: 2, group: "shape" },
      { type: "range", key: "shelves", min: 1, max: 8, step: 1, default: 4, group: "shape" },
      { type: "color", key: "tint", default: "#7a5230", group: "look" },
      { type: "seed", key: "seed", default: "", group: "shape" },
      { type: "action", key: "rand", action: "randomize", group: "shape" },
    ],
  };

  test("randomizeGroupParams only touches the group and stays in range", () => {
    const patch = randomizeGroupParams(GROUPED, "shape", () => 0.5);
    expect(Object.keys(patch).sort()).toEqual(["seed", "shelves", "width"]);
    expect(patch["width"]).toBeGreaterThanOrEqual(1);
    expect(patch["width"]).toBeLessThanOrEqual(4);
    expect(patch["shelves"]).toBe(5); // 1 + 0.5*7 = 4.5 → round 5, integer step
    expect(patch["tint"]).toBeUndefined();
    // The generated patch is always schema-valid.
    expect(validateParams(GROUPED, patch)).toEqual([]);
  });

  test("resetGroupParams restores the group's defaults", () => {
    expect(resetGroupParams(GROUPED, "shape")).toEqual({ width: 2, shelves: 4, seed: "" });
  });

  test("action fields carry no value and no default", () => {
    expect(parseParams(GROUPED, {})["rand"]).toBeUndefined();
    expect(defaultParamMeta(GROUPED)["rand"]).toBeUndefined();
  });
});

describe("curves and gradients", () => {
  const SHAPED = defineParamSchema({
    fields: [
      { type: "curve", key: "profile", min: 0, max: 2, default: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      { type: "gradient", key: "ramp", default: [{ at: 0, color: "#000000" }, { at: 1, color: "#ffffff" }] },
    ],
  });

  test("parse clamps curve points and sorts them by x", () => {
    const parsed = parseParams(SHAPED, { profile: [{ x: 1.5, y: 9 }, { x: 0.2, y: -1 }] });
    expect(parsed.profile).toEqual([{ x: 0.2, y: 0 }, { x: 1, y: 2 }]);
  });

  test("parse drops non-hex gradient stops and falls back to the default when none survive", () => {
    expect(parseParams(SHAPED, { ramp: [{ at: 0.5, color: "red" }] }).ramp).toEqual([{ at: 0, color: "#000000" }, { at: 1, color: "#ffffff" }]);
  });

  test("sampleCurve interpolates and holds the ends", () => {
    const points = [{ x: 0, y: 0 }, { x: 1, y: 2 }];
    expect(sampleCurve(points, 0.25)).toBeCloseTo(0.5);
    expect(sampleCurve(points, -1)).toBe(0);
    expect(sampleCurve(points, 2)).toBe(2);
  });

  test("sampleGradient mixes neighbouring stops", () => {
    expect(sampleGradient([{ at: 0, color: "#000000" }, { at: 1, color: "#ffffff" }], 0.5)).toBe("#808080");
  });
});

describe("typed params", () => {
  test("a defined schema parses to exact field types", () => {
    const schema = defineParamSchema({
      fields: [
        { type: "range", key: "height", min: 0, max: 2, default: 1 },
        { type: "bool", key: "wind", default: true },
        { type: "select", key: "mode", options: [{ value: "lawn" }, { value: "dune" }], default: "lawn" },
      ],
    });
    const params: ParamsOf<typeof schema> = parseParams(schema, { height: 1.5, mode: "dune" });
    const height: number = params.height;
    const wind: boolean = params.wind;
    const mode: "lawn" | "dune" = params.mode;
    expect([height, wind, mode]).toEqual([1.5, true, "dune"]);
  });

  test("colour fields require a hex value", () => {
    const schema: ParamSchema = { fields: [{ type: "color", key: "tint", default: "#336633" }] };
    expect(parseParams(schema, { tint: "green" })["tint"]).toBe("#336633");
    expect(validateParams(schema, { tint: "green" }).map((issue) => issue.key)).toEqual(["tint"]);
  });
});

describe("jitterParams", () => {
  const SCHEMA = defineParamSchema({
    fields: [
      { type: "range", key: "height", min: 0, max: 10, default: 5 },
      { type: "range", key: "fixed", min: 0, max: 10, default: 5, vary: false },
      { type: "color", key: "tint", default: "#336633" },
    ],
  });

  test("stays within bounds and leaves vary:false fields alone", () => {
    for (let i = 0; i < 20; i += 1) {
      const patch = jitterParams(SCHEMA, undefined, seededRng(`j${i}`), 1);
      expect(patch["fixed"]).toBeUndefined();
      expect(validateParams(SCHEMA, patch)).toEqual([]);
    }
  });

  test("amount 0 changes nothing", () => {
    expect(jitterParams(SCHEMA, { height: 3 }, seededRng("zero"), 0)).toEqual({});
  });
});

describe("nested groups", () => {
  test("childParamGroups returns top-level and nested sections", () => {
    const schema: ParamSchema = {
      fields: [],
      groups: [
        { id: "blades", label: "Blades" },
        { id: "shape", label: "Shape", parent: "blades" },
        { id: "orphan", label: "Orphan", parent: "missing" },
      ],
    };
    expect(childParamGroups(schema, undefined).map((group) => group.id)).toEqual(["blades", "orphan"]);
    expect(childParamGroups(schema, "blades").map((group) => group.id)).toEqual(["shape"]);
  });
});
