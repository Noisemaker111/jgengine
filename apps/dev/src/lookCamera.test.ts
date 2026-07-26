import { describe, expect, it } from "bun:test";

import {
  LOOK_GROUND_CLEARANCE,
  formatAppliedAim,
  resolveLookCamera,
  verifyLookSubject,
  type LookTerrain,
} from "./lookCamera";

const flat: LookTerrain = { sampleHeight: () => 0 };
const slope: LookTerrain = { sampleHeight: (_x, z) => Math.max(0, z) };
const bounded: LookTerrain = { sampleHeight: () => 0, bounds: { w: 200, d: 100 } };

function camera(result: ReturnType<typeof resolveLookCamera>) {
  if (result.kind !== "camera") throw new Error(`expected a camera, got ${JSON.stringify(result)}`);
  return result;
}

describe("resolveLookCamera", () => {
  it("is inert without ?look=", () => {
    expect(resolveLookCamera({ look: null, lookFrom: null, terrain: flat }).kind).toBe("none");
  });

  it("samples the ground for the two-number form", () => {
    const { camera: config, applied } = camera(
      resolveLookCamera({ look: "10,20", lookFrom: null, terrain: slope }),
    );
    expect(config.observer?.bind).toEqual({ kind: "point", position: { x: 10, y: 20, z: 20 } });
    expect(applied.target).toEqual({ x: 10, y: 20, z: 20 });
  });

  it("takes the explicit height for the three-number form", () => {
    const { applied } = camera(resolveLookCamera({ look: "10,7,20", lookFrom: null, terrain: slope }));
    expect(applied.target).toEqual({ x: 10, y: 7, z: 20 });
  });

  it("applies the vantage from ?lookFrom=", () => {
    const { applied } = camera(resolveLookCamera({ look: "0,0", lookFrom: "30,9,0", terrain: flat }));
    expect(applied.distance).toBe(30);
    expect(applied.height).toBe(9);
    expect(applied.camera).toEqual({ x: 0, y: 9, z: 30 });
  });

  it("lifts a camera the terrain would bury", () => {
    // Ground under the camera (z = 12) is 12 units up; the requested height of 5 is underground.
    const { applied } = camera(resolveLookCamera({ look: "0,0", lookFrom: null, terrain: slope }));
    expect(applied.lifted).toBe(true);
    expect(applied.height).toBe(12 + LOOK_GROUND_CLEARANCE);
    expect(applied.camera.y).toBe(12 + LOOK_GROUND_CLEARANCE);
  });

  it("keeps a height that already clears the ground", () => {
    const { applied } = camera(resolveLookCamera({ look: "0,0", lookFrom: "12,40", terrain: slope }));
    expect(applied.lifted).toBe(false);
    expect(applied.height).toBe(40);
  });

  it("rejects an aim outside the world instead of framing empty space", () => {
    const result = resolveLookCamera({ look: "900,900", lookFrom: null, terrain: bounded });
    expect(result).toEqual({ kind: "error", message: expect.stringContaining("outside the world") });
  });

  it("accepts an aim inside the world", () => {
    expect(resolveLookCamera({ look: "99,49", lookFrom: null, terrain: bounded }).kind).toBe("camera");
  });

  it("rejects a single coordinate rather than silently ignoring the override", () => {
    expect(resolveLookCamera({ look: "5", lookFrom: null, terrain: flat })).toEqual({
      kind: "error",
      message: expect.stringContaining("needs x,z or x,y,z"),
    });
  });

  it("rejects non-numeric fields", () => {
    expect(resolveLookCamera({ look: "abc,def", lookFrom: null, terrain: flat })).toEqual({
      kind: "error",
      message: expect.stringContaining("field 1"),
    });
  });

  it("rejects the retired positional tail", () => {
    expect(resolveLookCamera({ look: "0,0,0,2,0.5", lookFrom: null, terrain: flat })).toEqual({
      kind: "error",
      message: expect.stringContaining("at most 3"),
    });
  });

  it("rejects a degenerate distance", () => {
    expect(resolveLookCamera({ look: "0,0", lookFrom: "0", terrain: flat })).toEqual({
      kind: "error",
      message: expect.stringContaining("distance must be positive"),
    });
  });

  it("rejects a vantage with no aim", () => {
    expect(resolveLookCamera({ look: null, lookFrom: "20", terrain: flat })).toEqual({
      kind: "error",
      message: expect.stringContaining("without ?look="),
    });
  });

  it("honours a bare height in the middle slot", () => {
    const { applied } = camera(resolveLookCamera({ look: "0,0", lookFrom: ",20,", terrain: flat }));
    expect(applied.distance).toBe(12);
    expect(applied.height).toBe(20);
    expect(applied.angle).toBe(0);
  });
});

describe("subject aiming", () => {
  const markers = {
    "west-gate": { x: 20, y: 0, z: -10 },
    keep: { x: 0, y: 3, z: -30 },
    hilltop: { x: 0, y: 0, z: 20 },
  };

  it("resolves a marker id to its authored position", () => {
    const { applied } = camera(
      resolveLookCamera({ look: "@marker:west-gate", lookFrom: null, terrain: flat, markers }),
    );
    expect(applied.target).toEqual({ x: 20, y: 0, z: -10 });
    expect(applied.subject).toBe("@marker:west-gate");
  });

  it("gives a marker the same terrain clearance a coordinate gets", () => {
    // Camera lands at z = 32 on the slope, where the ground is 32 units up.
    const { applied } = camera(
      resolveLookCamera({ look: "@marker:hilltop", lookFrom: null, terrain: slope, markers }),
    );
    expect(applied.lifted).toBe(true);
    expect(applied.height).toBe(32 + LOOK_GROUND_CLEARANCE);
  });

  it("names the available markers when the id is wrong", () => {
    expect(resolveLookCamera({ look: "@marker:nope", lookFrom: null, terrain: flat, markers })).toEqual({
      kind: "error",
      message: expect.stringContaining("known markers: hilltop, keep, west-gate"),
    });
  });

  it("says so when the scene has no markers at all", () => {
    expect(resolveLookCamera({ look: "@marker:any", lookFrom: null, terrain: flat })).toEqual({
      kind: "error",
      message: expect.stringContaining("no authored markers"),
    });
  });

  it("binds an entity id straight onto the observer rig so the shot tracks it", () => {
    const { camera: config, applied } = camera(
      resolveLookCamera({ look: "@entity:boss-01", lookFrom: "20,6", terrain: flat }),
    );
    expect(config.observer?.bind).toEqual({ kind: "entity", entityId: "boss-01" });
    expect(config.observer?.distance).toBe(20);
    expect(applied.subject).toBe("@entity:boss-01");
  });

  it("omits the unknowable positions from an entity aim readout", () => {
    const { applied } = camera(resolveLookCamera({ look: "@entity:boss-01", lookFrom: null, terrain: flat }));
    expect(JSON.parse(formatAppliedAim(applied))).toMatchObject({ subject: "@entity:boss-01", target: null });
  });

  it("rejects an unknown subject kind", () => {
    expect(resolveLookCamera({ look: "@prop:crate", lookFrom: null, terrain: flat })).toEqual({
      kind: "error",
      message: expect.stringContaining("not a subject kind"),
    });
  });

  it("still validates the vantage on a subject aim", () => {
    expect(resolveLookCamera({ look: "@entity:x", lookFrom: "0", terrain: flat })).toEqual({
      kind: "error",
      message: expect.stringContaining("distance must be positive"),
    });
  });
});

describe("verifyLookSubject", () => {
  const has = (id: string) => id === "boss-01";

  it("passes an entity aim that resolved", () => {
    expect(verifyLookSubject("@entity:boss-01", has)).toBeNull();
  });

  it("fails a typo'd entity id rather than letting it frame the origin", () => {
    expect(verifyLookSubject("@entity:boss-1", has)).toContain("no such entity");
  });

  it("ignores coordinate, marker, and absent aims", () => {
    expect(verifyLookSubject("0,0", has)).toBeNull();
    expect(verifyLookSubject("@marker:keep", has)).toBeNull();
    expect(verifyLookSubject(null, has)).toBeNull();
  });
});
