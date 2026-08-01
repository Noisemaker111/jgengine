import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { syncShadowProjection } from "./SceneLighting";

describe("syncShadowProjection", () => {
  test("stale projection after pierced bound writes is refreshed", () => {
    const light = new THREE.DirectionalLight();
    const before = light.shadow.camera.projectionMatrix.clone();

    // What R3F pierced props do: write bounds, never updateProjectionMatrix.
    light.shadow.camera.left = -120;
    light.shadow.camera.right = 120;
    light.shadow.camera.top = 120;
    light.shadow.camera.bottom = -120;
    expect(light.shadow.camera.projectionMatrix.equals(before)).toBe(true);

    syncShadowProjection(light);
    expect(light.shadow.camera.projectionMatrix.equals(before)).toBe(false);

    const expected = new THREE.OrthographicCamera(-120, 120, 120, -120, light.shadow.camera.near, light.shadow.camera.far);
    expect(light.shadow.camera.projectionMatrix.equals(expected.projectionMatrix)).toBe(true);
  });
});
