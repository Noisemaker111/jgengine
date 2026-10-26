import { expect, test } from "bun:test";
import * as THREE from "three";

import { buildPostGraph, disposeGraph, planPostStages } from "./PostProcessing.draw";
import { ContactShadowPass, contactShadowFragment, findKeyLight, towardLight } from "./contactShadowPass.draw";

test("the key light is the strongest visible shadow-casting sun", () => {
  const scene = new THREE.Scene();
  const fill = new THREE.DirectionalLight("#fff", 3);
  const sun = new THREE.DirectionalLight("#fff", 2);
  sun.castShadow = true;
  const hidden = new THREE.DirectionalLight("#fff", 9);
  hidden.castShadow = true;
  hidden.visible = false;
  scene.add(fill, sun, hidden);
  expect(findKeyLight(scene)).toBe(sun);
  sun.castShadow = false;
  expect(findKeyLight(scene)).toBeNull();
});

test("the light direction points from the target toward the light", () => {
  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight();
  sun.position.set(10, 10, 0);
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);
  scene.updateMatrixWorld(true);
  const direction = towardLight(sun, new THREE.Vector3());
  expect(direction.x).toBeCloseTo(Math.SQRT1_2);
  expect(direction.y).toBeCloseTo(Math.SQRT1_2);
  sun.position.set(0, 0, 0);
  scene.updateMatrixWorld(true);
  expect(towardLight(sun, new THREE.Vector3()).toArray()).toEqual([0, 1, 0]);
});

test("the march loop is unrolled to the tier's step count", () => {
  expect(contactShadowFragment(8)).toContain("i < 8;");
  expect(contactShadowFragment(16)).toContain("i < 16;");
});

const stubRenderer = () =>
  ({
    getPixelRatio: () => 1,
    getSize: (target: THREE.Vector2) => target.set(8, 8),
  }) as unknown as THREE.WebGLRenderer;

test("contact shadows run on medium and up, after AO, and never on low or under MSAA", () => {
  const authored = { ao: false as const, bloom: false as const, grade: false as const, autoExposure: false as const };
  expect(planPostStages(authored, "low").contactShadows).toBeNull();
  expect(planPostStages({ ...authored, aa: "msaa" }, "high").contactShadows).toBeNull();
  expect(planPostStages({ ...authored, contactShadows: false }, "high").contactShadows).toBeNull();
  const plan = planPostStages({ ...authored, aa: false, contactShadows: { intensity: 0.3 } }, "medium");
  expect(plan.contactShadows).toEqual({ intensity: 0.3 });
  expect(plan.samples).toBe(0);
  const graph = buildPostGraph(stubRenderer(), new THREE.Scene(), new THREE.PerspectiveCamera(), plan, 320, 180);
  const pass = graph.composer.passes.find((candidate) => candidate instanceof ContactShadowPass) as ContactShadowPass;
  expect(pass).toBeDefined();
  expect(pass.needsSwap).toBe(false);
  expect(pass.material.uniforms.uIntensity!.value).toBe(0.3);
  expect(pass.material.uniforms.tDepth!.value).toBe(graph.composer.renderTarget1.depthTexture);
  disposeGraph(graph);
});
