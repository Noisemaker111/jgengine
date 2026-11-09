import { expect, test } from "bun:test";
import * as THREE from "three";

import { DEFAULT_SSR } from "@jgengine/core/render/postProcessing";
import { findGlossySurfaces, SsrPass, ssrFragment, surfaceGloss } from "./ssrPass.draw";

test("the reflection march takes as many steps as the tier pays for", () => {
  expect(ssrFragment(16)).toContain("i < 16");
  expect(ssrFragment(32)).toContain("/ 32.0");
});

/** A renderer that records what each render call drew: the scene's materials, or the quad's. */
function recordingRenderer(): { renderer: THREE.WebGLRenderer; drawn: string[][] } {
  const drawn: string[][] = [];
  const fake = {
    shadowMap: { autoUpdate: true },
    getClearColor: (target: THREE.Color) => target,
    getClearAlpha: () => 1,
    setClearColor: () => {},
    setRenderTarget: () => {},
    clear: () => {},
    render: (scene: THREE.Object3D) => {
      const materials: string[] = [];
      scene.traverse((node) => {
        const material = (node as THREE.Mesh).material;
        if (material instanceof THREE.Material) materials.push(material instanceof THREE.ShaderMaterial && material.fragmentShader.includes("uGloss") ? "mask" : "march");
      });
      drawn.push(materials);
    },
  };
  return { renderer: fake as unknown as THREE.WebGLRenderer, drawn };
}

test("a dry run draws the mask and the march with nothing glossy in view, so both link before play needs them", () => {
  const pass = new SsrPass(new THREE.Scene(), new THREE.PerspectiveCamera(), new THREE.DepthTexture(4, 4), DEFAULT_SSR, 8);
  const target = new THREE.WebGLRenderTarget(4, 4);
  const { renderer, drawn } = recordingRenderer();
  try {
    pass.render(renderer, target, target);
    expect(drawn).toEqual([]);
    pass.dry = true;
    pass.render(renderer, target, target);
    expect(drawn).toEqual([["mask"], ["march"]]);
  } finally {
    pass.dispose();
    target.dispose();
  }
});

test("authored values reach the shader clamped to their sane ranges", () => {
  const pass = new SsrPass(new THREE.Scene(), new THREE.PerspectiveCamera(), new THREE.DepthTexture(4, 4), { ...DEFAULT_SSR, reflectance: 3, maxDistance: -5, thickness: 0 }, 8);
  try {
    expect(pass.uniforms.uReflectance.value).toBe(1);
    expect(pass.uniforms.uMaxDistance.value).toBeGreaterThan(0);
    expect(pass.uniforms.uThickness.value).toBeGreaterThan(0);
  } finally {
    pass.dispose();
  }
});

test("only smooth opaque surfaces reflect unless a mesh says otherwise", () => {
  const mesh = (roughness: number, extra: Partial<THREE.MeshStandardMaterial> = {}) =>
    new THREE.Mesh(new THREE.PlaneGeometry(), Object.assign(new THREE.MeshStandardMaterial({ roughness }), extra));
  expect(surfaceGloss(mesh(0.9), 0.4)).toBe(0);
  expect(surfaceGloss(mesh(0), 0.4)).toBe(1);
  expect(surfaceGloss(mesh(0.2), 0.4)).toBeCloseTo(0.5);
  expect(surfaceGloss(mesh(0.1, { transparent: true }), 0.4)).toBe(0);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.ShaderMaterial());
  expect(surfaceGloss(water, 0.4)).toBe(0);
  water.userData["ssr"] = 0.8;
  expect(surfaceGloss(water, 0.4)).toBe(0.8);
  const polished = mesh(0);
  polished.userData["ssr"] = false;
  expect(surfaceGloss(polished, 0.4)).toBe(0);

  const scene = new THREE.Scene();
  scene.add(mesh(0.9), mesh(0.1), polished, water);
  expect(findGlossySurfaces(scene, 0.4).map((entry) => entry.gloss).sort()).toEqual([0.75, 0.8]);
});
