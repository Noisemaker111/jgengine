import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { defineBuildingKit } from "@jgengine/core/world/buildingKit";

import {
  bucketBuildingParts,
  buildingKitFitScale,
  composeBuildingKitMatrix,
  measureBuildingKitModel,
  type BuildingKitInstance,
} from "./buildingKitFit";
import type { BuildingPartPlacement, InstancedBuildingPlacement } from "./GeneratedBuilding";

function part(overrides: Partial<BuildingPartPlacement> = {}): BuildingPartPlacement {
  return {
    id: "p1",
    kind: "window",
    facade: "front",
    position: [0, 0, 0],
    rotationY: 0,
    scale: [1, 1, 1],
    ...overrides,
  };
}

function placement(parts: readonly BuildingPartPlacement[]): InstancedBuildingPlacement {
  return { building: { id: "b1", parts } };
}

function decompose(matrix: THREE.Matrix4) {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  return { position, quaternion, scale };
}

const IDENTITY_BOUNDS = { size: [1, 1, 1] as const, center: [0, 0, 0] as const };

function instance(overrides: Partial<BuildingKitInstance> = {}): BuildingKitInstance {
  return {
    position: [0, 0, 0],
    yaw: 0,
    slotScale: [1, 1, 1],
    fit: "native",
    part: { model: "m.glb" },
    ...overrides,
  };
}

describe("bucketBuildingParts", () => {
  test("keeps every part on the box path when no kit is bound", () => {
    const buckets = bucketBuildingParts(
      [placement([part(), part({ id: "p2", kind: "wall" }), part({ id: "p3", kind: "clothesline" })])],
      null,
    );
    expect(buckets.models.size).toBe(0);
    expect(buckets.boxes.get("window")).toHaveLength(1);
    expect(buckets.boxes.get("wall")).toHaveLength(1);
    // The clothesline still expands to its two rows.
    expect(buckets.boxes.get("clothesline")).toHaveLength(2);
  });

  test("bucketing is byte-identical with a kit that binds nothing", () => {
    const parts = [part(), part({ id: "p2", kind: "wall", position: [2, 3, 1], rotationY: 0.4 })];
    const bare = bucketBuildingParts([placement(parts)], null);
    const empty = bucketBuildingParts([placement(parts)], null, defineBuildingKit({ parts: {} }));
    expect(empty.models.size).toBe(0);
    for (const [kind, matrices] of bare.boxes) {
      const other = empty.boxes.get(kind);
      expect(other).toBeDefined();
      expect(other?.map((matrix) => matrix.toArray())).toEqual(matrices.map((matrix) => matrix.toArray()));
    }
  });

  test("routes bound kinds to a model bucket keyed by resolved URL and leaves the rest as boxes", () => {
    const kit = defineBuildingKit({ parts: { window: ["glass.glb"] } });
    const buckets = bucketBuildingParts(
      [placement([part(), part({ id: "p2", kind: "wall" })])],
      null,
      kit,
      (model) => `/assets/${model}`,
    );
    expect([...buckets.models.keys()]).toEqual(["/assets/glass.glb"]);
    expect(buckets.models.get("/assets/glass.glb")).toHaveLength(1);
    expect(buckets.boxes.get("window")).toBeUndefined();
    expect(buckets.boxes.get("wall")).toHaveLength(1);
  });

  test("omitted kinds draw nothing at all", () => {
    const kit = defineBuildingKit({ parts: {}, omit: ["window"] });
    const buckets = bucketBuildingParts([placement([part()])], null, kit);
    expect(buckets.models.size).toBe(0);
    expect(buckets.boxes.size).toBe(0);
  });

  test("the slot's variant picks the bound model, wrapping the variant list", () => {
    const kit = defineBuildingKit({ parts: { window: ["a.glb", "b.glb"] } });
    const buckets = bucketBuildingParts(
      [
        placement([
          part({ id: "p1", kit: { key: "front.window", variant: 0 } }),
          part({ id: "p2", kit: { key: "front.window", variant: 1 } }),
          part({ id: "p3", kit: { key: "front.window", variant: 3 } }),
        ]),
      ],
      null,
      kit,
    );
    expect(buckets.models.get("a.glb")).toHaveLength(1);
    expect(buckets.models.get("b.glb")).toHaveLength(2);
  });

  test("model instances carry the same world placement the box path would have used", () => {
    const kit = defineBuildingKit({ parts: { window: ["a.glb"] } });
    const parts = [part({ position: [1, 2, 3], rotationY: 0.25, scale: [2, 3, 0.2] })];
    const boxed = bucketBuildingParts([placement(parts)], null);
    const kitted = bucketBuildingParts([placement(parts)], null, kit);
    const boxPose = decompose(boxed.boxes.get("window")![0]!);
    const kitInstance = kitted.models.get("a.glb")![0]!;
    expect(kitInstance.position[0]).toBeCloseTo(boxPose.position.x, 6);
    expect(kitInstance.position[1]).toBeCloseTo(boxPose.position.y, 6);
    expect(kitInstance.position[2]).toBeCloseTo(boxPose.position.z, 6);
    expect(kitInstance.yaw).toBeCloseTo(0.25, 6);
    expect(kitInstance.slotScale).toEqual([2, 3, 0.2]);
  });

  test("visibility filtering still applies to the kit path", () => {
    const kit = defineBuildingKit({ parts: { window: ["a.glb"] } });
    const buckets = bucketBuildingParts([placement([part()])], new Set(["wall" as const]), kit);
    expect(buckets.models.size).toBe(0);
    expect(buckets.boxes.size).toBe(0);
  });
});

describe("buildingKitFitScale", () => {
  test("stretch fills the slot per axis", () => {
    expect(buildingKitFitScale("stretch", [2, 6, 1], [1, 2, 4])).toEqual([2, 3, 0.25]);
  });

  test("contain takes the smallest ratio, cover the largest", () => {
    expect(buildingKitFitScale("contain", [2, 6, 1], [1, 2, 4])).toEqual([0.25, 0.25, 0.25]);
    expect(buildingKitFitScale("cover", [2, 6, 1], [1, 2, 4])).toEqual([3, 3, 3]);
  });

  test("native ignores the slot entirely", () => {
    expect(buildingKitFitScale("native", [2, 6, 1], [1, 2, 4])).toEqual([1, 1, 1]);
  });

  test("degenerate and non-finite native extents fall back to 1 on that axis", () => {
    expect(buildingKitFitScale("stretch", [2, 6, 1], [0, 2, Number.NaN])).toEqual([1, 3, 1]);
    expect(buildingKitFitScale("stretch", [2, 6, 1], [1, 2, Number.POSITIVE_INFINITY])).toEqual([2, 3, 1]);
    expect(buildingKitFitScale("contain", [2, 6, 1], [0, 0, 0])).toEqual([1, 1, 1]);
    expect(buildingKitFitScale("cover", [2, 6, 1], [0, 0, 0])).toEqual([1, 1, 1]);
  });
});

describe("composeBuildingKitMatrix", () => {
  test("fit scale composes with the binding's scale multiplier", () => {
    const matrix = composeBuildingKitMatrix(
      instance({ fit: "stretch", slotScale: [2, 4, 1], part: { model: "m.glb", scale: [1, 0.5, 3] } }),
      { size: [1, 2, 1], center: [0, 0, 0] },
    );
    const { scale } = decompose(matrix);
    expect(scale.x).toBeCloseTo(2, 6);
    expect(scale.y).toBeCloseTo(1, 6);
    expect(scale.z).toBeCloseTo(3, 6);
  });

  test("a slot-local offset rotates into world space by the total yaw", () => {
    const matrix = composeBuildingKitMatrix(
      instance({ position: [10, 0, 5], yaw: Math.PI / 2, part: { model: "m.glb", offset: [0, 1, 2] } }),
      IDENTITY_BOUNDS,
    );
    const { position } = decompose(matrix);
    // Outward (+z local) at 90 degrees yaw points along +x; y is untouched.
    expect(position.x).toBeCloseTo(12, 6);
    expect(position.y).toBeCloseTo(1, 6);
    expect(position.z).toBeCloseTo(5, 6);
  });

  test("the offset's yaw includes the binding's own Y rotation", () => {
    const matrix = composeBuildingKitMatrix(
      instance({ part: { model: "m.glb", offset: [1, 0, 0], rotation: [0, Math.PI / 2, 0] } }),
      IDENTITY_BOUNDS,
    );
    const { position } = decompose(matrix);
    expect(position.x).toBeCloseTo(0, 6);
    expect(position.z).toBeCloseTo(-1, 6);
  });

  test("an off-origin model is recentred on the slot centre after fit scaling", () => {
    const matrix = composeBuildingKitMatrix(
      instance({ position: [4, 1, 0], fit: "stretch", slotScale: [2, 2, 2] }),
      { size: [1, 1, 1], center: [3, 0, 0] },
    );
    const { position, scale } = decompose(matrix);
    expect(scale.x).toBeCloseTo(2, 6);
    // Centre sits 3 units off the origin natively, 6 after the fit scale.
    expect(position.x).toBeCloseTo(-2, 6);
    expect(position.y).toBeCloseTo(1, 6);
  });

  test("the binding's Euler XYZ rotation stacks on top of the facade yaw", () => {
    const matrix = composeBuildingKitMatrix(
      instance({ yaw: Math.PI / 2, part: { model: "m.glb", rotation: [Math.PI / 2, 0, 0] } }),
      IDENTITY_BOUNDS,
    );
    const { quaternion } = decompose(matrix);
    const expected = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0, "XYZ")));
    expect(quaternion.angleTo(expected)).toBeCloseTo(0, 6);
  });
});

describe("measureBuildingKitModel", () => {
  test("measures the harvested root's world bounds", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6));
    mesh.position.set(1, 0, 0);
    mesh.updateMatrixWorld(true);
    const bounds = measureBuildingKitModel(mesh);
    expect(bounds.size[0]).toBeCloseTo(2, 6);
    expect(bounds.size[1]).toBeCloseTo(4, 6);
    expect(bounds.size[2]).toBeCloseTo(6, 6);
    expect(bounds.center[0]).toBeCloseTo(1, 6);
  });

  test("an empty root measures as zero rather than infinity", () => {
    expect(measureBuildingKitModel(new THREE.Group())).toEqual({ size: [0, 0, 0], center: [0, 0, 0] });
  });
});
