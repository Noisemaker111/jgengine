import { describe, expect, test } from "bun:test";
import type { RenderBounds } from "@jgengine/core/visibility/bounds";
import type { CameraView } from "@jgengine/core/visibility/frustum";
import { noOcclusion, createAxisAlignedOcclusionTester } from "@jgengine/core/visibility/occlusion";

function bounds(partial: Partial<RenderBounds>): RenderBounds {
  return {
    centerX: 0, centerY: 0, centerZ: 0, radius: 0,
    minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0,
    ...partial,
  };
}

const camera: CameraView = {
  kind: "perspective",
  position: [100, 0, 0],
  target: [0, 0, 0],
};

const object = bounds({
  centerX: 50, centerY: 0, centerZ: 0, radius: 1,
  minX: 40, maxX: 60, minY: -1, maxY: 1, minZ: -1, maxZ: 1,
});

const containingNearOccluder = bounds({
  centerX: 40, centerY: 0, centerZ: 0, radius: 50,
  minX: 0, maxX: 80, minY: -20, maxY: 20, minZ: -20, maxZ: 20,
});

describe("noOcclusion", () => {
  test("is disabled", () => {
    expect(noOcclusion.enabled).toBe(false);
  });

  test("never reports an object as occluded, even with a containing occluder present", () => {
    const occluded = noOcclusion.isOccluded({ camera, bounds: object, occluders: [containingNearOccluder] });
    expect(occluded).toBe(false);
  });
});

describe("createAxisAlignedOcclusionTester", () => {
  test("is disabled by default", () => {
    const tester = createAxisAlignedOcclusionTester();
    expect(tester.enabled).toBe(false);
  });

  test("enabled: false is preserved when explicitly set", () => {
    const tester = createAxisAlignedOcclusionTester({ enabled: false });
    expect(tester.enabled).toBe(false);
  });

  test("a large nearer occluder that fully contains the object's AABB occludes it", () => {
    const tester = createAxisAlignedOcclusionTester({ enabled: true });
    const occluded = tester.isOccluded({ camera, bounds: object, occluders: [containingNearOccluder] });
    expect(occluded).toBe(true);
  });

  test("an occluder below minOccluderRadius never occludes", () => {
    const tester = createAxisAlignedOcclusionTester({ enabled: true });
    const smallOccluder = bounds({ ...containingNearOccluder, radius: 5 });
    const occluded = tester.isOccluded({ camera, bounds: object, occluders: [smallOccluder] });
    expect(occluded).toBe(false);
  });

  test("a large occluder respects a custom minOccluderRadius", () => {
    const tester = createAxisAlignedOcclusionTester({ enabled: true, minOccluderRadius: 100 });
    const occluded = tester.isOccluded({ camera, bounds: object, occluders: [containingNearOccluder] });
    expect(occluded).toBe(false);
  });

  test("an occluder that only partially overlaps the object never occludes it", () => {
    const tester = createAxisAlignedOcclusionTester({ enabled: true });
    const partialOccluder = bounds({ ...containingNearOccluder, maxX: 50 });
    const occluded = tester.isOccluded({ camera, bounds: object, occluders: [partialOccluder] });
    expect(occluded).toBe(false);
  });

  test("no occluders present means never occluded", () => {
    const tester = createAxisAlignedOcclusionTester({ enabled: true });
    const occluded = tester.isOccluded({ camera, bounds: object, occluders: [] });
    expect(occluded).toBe(false);
  });
});
