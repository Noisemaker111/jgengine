import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { applyModelWind, applyModelWindToScene, resolveModelWind, windClock } from "./modelWind";

function compiled(material: THREE.MeshStandardMaterial): { vertexShader: string; uniforms: Record<string, THREE.IUniform> } {
  const shader = {
    uniforms: {} as Record<string, THREE.IUniform>,
    vertexShader: "#include <common>\nvoid main() {\n#include <begin_vertex>\n}",
    fragmentShader: "#include <common>",
  };
  material.onBeforeCompile(shader as never, {} as never);
  return shader;
}

describe("model wind", () => {
  test("resolves authored sway settings with defaults and rejects impossible values", () => {
    expect(resolveModelWind(undefined, 6)).toBeNull();
    expect(resolveModelWind(false, 6)).toBeNull();
    const resolved = resolveModelWind({ strength: 0.6 }, 6)!;
    expect(resolved.strength).toBe(0.6);
    expect(resolved.height).toBe(6);
    expect(resolved.speed).toBe(1);
    expect(resolved.direction.length()).toBeCloseTo(1, 5);
    expect(() => resolveModelWind({ strength: -1 }, 6)).toThrow(/strength/);
    expect(() => resolveModelWind({ speed: 0 }, 6)).toThrow(/speed/);
    expect(() => resolveModelWind({ height: 0 }, 6)).toThrow(/height/);
  });

  test("compiles height-ramped sway after begin_vertex and shares the scene clock", () => {
    const material = new THREE.MeshStandardMaterial();
    const wind = resolveModelWind({ strength: 0.5, speed: 1.4, height: 7 }, 4)!;
    applyModelWind(material, wind);
    const shader = compiled(material);
    expect(shader.uniforms.uJgWindTime).toBe(windClock);
    expect((shader.uniforms.uJgWindStrength!.value as number)).toBe(0.5);
    expect(shader.vertexShader).toContain("uJgWindStrength");
    const include = shader.vertexShader.indexOf("#include <begin_vertex>");
    const sway = shader.vertexShader.indexOf("transformed.x += jgWindPush.x");
    expect(include).toBeGreaterThanOrEqual(0);
    expect(sway).toBeGreaterThan(include);
    expect(material.customProgramCacheKey()).toContain("jg-wind");
  });

  test("patches a model once and leaves rigid models untouched", () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    root.add(mesh);
    applyModelWindToScene(root, { strength: 0.2 }, 3);
    const key = mesh.material.customProgramCacheKey();
    applyModelWindToScene(root, { strength: 0.9 }, 3);
    expect(mesh.material.customProgramCacheKey()).toBe(key);
    const rigid = new THREE.Group();
    const untouched = new THREE.MeshStandardMaterial();
    rigid.add(new THREE.Mesh(new THREE.BoxGeometry(), untouched));
    applyModelWindToScene(rigid, undefined, 3);
    expect(untouched.userData["jgWind"]).toBeUndefined();
  });
});
