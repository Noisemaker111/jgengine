/** @jsxImportSource @jgengine/core/ui/jsx */
import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { createElement } from "@jgengine/core/ui/jsx";
import { mountTestDraws } from "@jgengine/core/frame/testEngineHost.draw";

import { RainField, rainAmount } from "./RainField.draw";
import { SnowField } from "./SnowField.draw";
import { DEFAULT_RAIN_DENSITY } from "./weatherMath";

function weatherMesh(scene: THREE.Scene): THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial> {
  const found: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>[] = [];
  scene.traverse((object) => { if ((object as THREE.Mesh).isMesh) found.push(object as (typeof found)[number]); });
  if (found.length === 0) throw new Error("no weather mesh mounted");
  return found[0]!;
}

describe("rain field", () => {
  test("reports a steady shower at the default density, scaled by local rain and capped", () => {
    expect(rainAmount(DEFAULT_RAIN_DENSITY, 1)).toBeCloseTo(0.8, 5);
    expect(rainAmount(DEFAULT_RAIN_DENSITY, 0.5)).toBeCloseTo(0.4, 5);
    expect(rainAmount(DEFAULT_RAIN_DENSITY * 4, 1)).toBe(1);
    expect(rainAmount(0, 1)).toBe(0);
    expect(rainAmount(-1, 1)).toBe(0);
  });

  for (const [name, field] of [["rain", RainField], ["snow", SnowField]] as const) {
    test(`a bounded ${name} field draws only while its wrap volume reaches the bounds and hands the shader its rectangle`, async () => {
      const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000);
      camera.position.set(0, 2, 0);
      const bounds = { minX: -40, minZ: 300, maxX: 40, maxZ: 500, fade: 6 };
      const m = await mountTestDraws(createElement(field, { count: 30, density: 1, volume: [60, 40, 60], bounds, timeSeconds: 0 }), { camera });
      try {
        await m.advance(1 / 60);
        const mesh = weatherMesh(m.scene);
        expect(mesh.geometry.instanceCount).toBe(0);
        expect((mesh.material.uniforms.uBounds!.value as THREE.Vector4).toArray()).toEqual([-40, 300, 40, 500]);
        expect(mesh.material.uniforms.uBoundsFade!.value).toBe(6);
        expect(mesh.material.vertexShader).toContain("weatherBounds(worldCenter)");
        camera.position.set(0, 2, 280);
        await m.advance(1 / 60);
        expect(mesh.geometry.instanceCount).toBe(30);
        camera.position.set(0, 2, 400);
        await m.advance(1 / 60);
        expect(mesh.geometry.instanceCount).toBe(30);
      } finally {
        await m.unmount();
      }
    });
  }

  test("an unbounded field keeps drawing everywhere", async () => {
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000);
    camera.position.set(9000, 2, -9000);
    const m = await mountTestDraws(createElement(RainField, { count: 30, density: 1, timeSeconds: 0 }), { camera });
    try {
      await m.advance(1 / 60);
      const mesh = weatherMesh(m.scene);
      expect(mesh.geometry.instanceCount).toBe(30);
      expect((mesh.material.uniforms.uBounds!.value as THREE.Vector4).x).toBeLessThan(-1e6);
    } finally {
      await m.unmount();
    }
  });
});
