import { describe, expect, test } from "bun:test";

import {
  CAMERA_TRANSPARENT_USERDATA,
  isCameraOccluderTransparent,
  type CameraOccluder,
} from "./cameraCollision";

function node(userData: Record<string, unknown> | undefined, parent: CameraOccluder | null = null): CameraOccluder {
  return { userData, parent };
}

describe("camera spring-arm occlusion filter", () => {
  test("untagged geometry blocks the camera (unchanged behavior)", () => {
    expect(isCameraOccluderTransparent(node({}))).toBe(false);
    expect(isCameraOccluderTransparent(node(undefined))).toBe(false);
    expect(isCameraOccluderTransparent(null)).toBe(false);
  });

  test("self-tagged decor passes through", () => {
    expect(isCameraOccluderTransparent(node({ jgCameraTransparent: true }))).toBe(true);
  });

  test("the flag is inheritable: a child of a transparent group passes through", () => {
    const decorGroup = node({ jgCameraTransparent: true });
    const mesh = node({}, decorGroup);
    const nested = node(undefined, mesh);
    expect(isCameraOccluderTransparent(mesh)).toBe(true);
    expect(isCameraOccluderTransparent(nested)).toBe(true);
  });

  test("a descendant opts back into blocking with jgCameraCollide (nearest tag wins)", () => {
    const decorGroup = node({ jgCameraTransparent: true });
    const solidChild = node({ jgCameraCollide: true }, decorGroup);
    const solidMesh = node({}, solidChild);
    expect(isCameraOccluderTransparent(solidChild)).toBe(false);
    expect(isCameraOccluderTransparent(solidMesh)).toBe(false);
  });

  test("the exported wrapper userData carries the transparent flag", () => {
    expect(isCameraOccluderTransparent(node(CAMERA_TRANSPARENT_USERDATA))).toBe(true);
  });
});
