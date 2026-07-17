import { describe, expect, test } from "bun:test";

import { quarterTurnsToRotationY } from "../world/placementController";
import { resolvePlaceAsset } from "../world/placeAsset";
import {
  applyRotationPolicy,
  headingToRotationY,
  normalizeDegrees,
  parseAssetSpace,
  parseRotationPolicy,
  resolveAnchorOffset,
  resolveFacingRotationY,
  rotatedFootprint,
  rotationYToHeading,
  snapHeading,
  toEngineUnits,
  validateAssetSpace,
  type AssetSpace,
} from "./assetSpace";

const TAU = Math.PI * 2;

describe("assetSpace headings", () => {
  test("normalizeDegrees wraps into [0, 360) and guards non-finite", () => {
    expect(normalizeDegrees(0)).toBe(0);
    expect(normalizeDegrees(370)).toBe(10);
    expect(normalizeDegrees(-90)).toBe(270);
    expect(normalizeDegrees(Number.NaN)).toBe(0);
  });

  test("north is heading 0 and a quarter turn is 90 degrees clockwise", () => {
    expect(headingToRotationY(0)).toBe(0);
    expect(headingToRotationY(90)).toBeCloseTo(-Math.PI / 2, 10);
    expect(headingToRotationY(180)).toBeCloseTo(Math.PI, 10);
  });

  test("headingToRotationY matches the legacy quarterTurns model", () => {
    for (let q = 0; q < 4; q += 1) {
      // Same visual rotation modulo a full turn.
      const legacy = ((quarterTurnsToRotationY(q) % TAU) + TAU) % TAU;
      const degrees = ((headingToRotationY(q * 90) % TAU) + TAU) % TAU;
      expect(degrees).toBeCloseTo(legacy, 10);
      expect(rotationYToHeading(quarterTurnsToRotationY(q))).toBeCloseTo(normalizeDegrees(q * 90), 10);
    }
  });

  test("rotationYToHeading inverts headingToRotationY", () => {
    for (const deg of [0, 15, 45, 90, 200, 359]) {
      expect(rotationYToHeading(headingToRotationY(deg))).toBeCloseTo(deg, 10);
    }
  });
});

describe("rotation policy (locked / snap / free adopters)", () => {
  test("free rotation only normalizes", () => {
    expect(applyRotationPolicy(200.4, { mode: "free" })).toBeCloseTo(200.4, 10);
    expect(applyRotationPolicy(-10, undefined)).toBe(350);
  });

  test("locked pins to a fixed heading regardless of input", () => {
    expect(applyRotationPolicy(123, { mode: "locked", degrees: 90 })).toBe(90);
    expect(applyRotationPolicy(123, { mode: "locked" })).toBe(0);
  });

  test("15-degree snap quantizes to the nearest increment", () => {
    expect(applyRotationPolicy(52, { mode: "snap", snapDegrees: 15 })).toBe(45);
    expect(applyRotationPolicy(8, { mode: "snap", snapDegrees: 15 })).toBe(15);
    expect(snapHeading(355, 15)).toBe(0);
  });

  test("45-degree snap quantizes to eight compass directions", () => {
    expect(applyRotationPolicy(30, { mode: "snap", snapDegrees: 45 })).toBe(45);
    expect(applyRotationPolicy(200, { mode: "snap", snapDegrees: 45 })).toBe(180);
  });
});

describe("canonical facing correction (replaces per-game corrective yaw)", () => {
  test("a south-facing model placed toward north resolves to Math.PI", () => {
    // Claudecraft rotates every NPC by Math.PI; encode it as forwardDegrees: 180 instead.
    const space: AssetSpace = { forwardDegrees: 180 };
    expect(resolveFacingRotationY(0, space)).toBeCloseTo(Math.PI, 10);
  });

  test("no metadata is a no-op passthrough", () => {
    expect(resolveFacingRotationY(90)).toBeCloseTo(headingToRotationY(90), 10);
  });

  test("facing composes with the requested heading", () => {
    const space: AssetSpace = { forwardDegrees: 90 };
    // Model already faces east; asking for east should need no extra rotation.
    expect(resolveFacingRotationY(90, space)).toBeCloseTo(0, 10);
  });
});

describe("unit conversion (replaces per-model scale constants)", () => {
  test("toEngineUnits multiplies by the catalog unit scale", () => {
    // A ~4-unit kit tile brought down to a 1-unit grid: unitScale 0.25.
    expect(toEngineUnits(4, { unitScale: 0.25 })).toBe(1);
    expect(toEngineUnits(4)).toBe(4);
  });

  test("invalid unit scales fall back to identity", () => {
    expect(toEngineUnits(4, { unitScale: 0 })).toBe(4);
    expect(toEngineUnits(4, { unitScale: Number.NaN })).toBe(4);
  });
});

describe("footprint and anchor", () => {
  test("a quarter turn swaps footprint width and depth", () => {
    const turned = rotatedFootprint({ w: 4, d: 2 }, 90);
    expect(turned.w).toBeCloseTo(2, 10);
    expect(turned.d).toBeCloseTo(4, 10);
  });

  test("a 45-degree turn grows the axis-aligned extent", () => {
    const turned = rotatedFootprint({ w: 2, d: 2 }, 45);
    expect(turned.w).toBeCloseTo(2 * Math.SQRT2, 10);
    expect(turned.d).toBeCloseTo(2 * Math.SQRT2, 10);
  });

  test("anchor offset seats center vs corner pivots", () => {
    expect(resolveAnchorOffset({ footprint: { w: 4, d: 2 }, anchor: "center" })).toEqual([0, 0]);
    expect(resolveAnchorOffset({ footprint: { w: 4, d: 2 }, anchor: "corner" })).toEqual([-2, -1]);
    expect(resolveAnchorOffset({ footprint: { w: 4, d: 2 }, anchor: { x: 0.5, z: 0 } })).toEqual([2, 0]);
  });
});

describe("validation and serialization", () => {
  test("valid metadata reports no issues", () => {
    const space: AssetSpace = {
      forwardDegrees: 180,
      unitScale: 0.25,
      footprint: { w: 4, d: 2 },
      gridSize: 1,
      anchor: "corner",
      bounds: { minX: -2, maxX: 2, minZ: -1, maxZ: 1 },
      rotation: { mode: "snap", snapDegrees: 15 },
    };
    expect(validateAssetSpace(space)).toEqual([]);
  });

  test("contradictory or malformed metadata is flagged during catalog generation", () => {
    const issues = validateAssetSpace({
      forwardDegrees: Number.POSITIVE_INFINITY,
      unitScale: -1,
      footprint: { w: 0, d: 2 },
      bounds: { minX: 2, maxX: -2, minZ: 0, maxZ: 1 },
      rotation: { mode: "snap", snapDegrees: 0 },
    });
    const fields = issues.map((i) => i.field).sort();
    expect(fields).toEqual(["bounds", "footprint", "forwardDegrees", "rotation.snapDegrees", "unitScale"]);
  });

  test("parseAssetSpace round-trips through JSON, dropping bad fields", () => {
    const space: AssetSpace = {
      forwardDegrees: 180,
      unitScale: 0.25,
      footprint: { w: 4, d: 2 },
      anchor: { x: 0.25, z: -0.5 },
      rotation: { mode: "snap", snapDegrees: 45 },
    };
    const roundTripped = parseAssetSpace(JSON.parse(JSON.stringify(space)));
    expect(roundTripped).toEqual(space);
  });

  test("parseRotationPolicy defaults to free on malformed input", () => {
    expect(parseRotationPolicy(undefined)).toEqual({ mode: "free" });
    expect(parseRotationPolicy({ mode: "snap", snapDegrees: -3 })).toEqual({ mode: "free" });
    expect(parseRotationPolicy({ mode: "locked", degrees: 450 })).toEqual({ mode: "locked", degrees: 90 });
  });
});

describe("place-asset resolution path", () => {
  test("headingDegrees drives rotationY through the asset's policy and facing", () => {
    const space: AssetSpace = { forwardDegrees: 180, rotation: { mode: "snap", snapDegrees: 45 } };
    const result = resolvePlaceAsset({
      assetId: "villager",
      position: { x: 1, y: 0, z: 2 },
      headingDegrees: 40, // snaps to 45, then corrected for a south-facing model
      space,
    });
    expect(result.rotationY).toBeCloseTo(resolveFacingRotationY(45, space), 10);
  });

  test("without headingDegrees rotationY passes through unchanged", () => {
    const result = resolvePlaceAsset({ assetId: "crate", position: { x: 0, y: 0, z: 0 }, rotationY: 1.23 });
    expect(result.rotationY).toBe(1.23);
  });
});
