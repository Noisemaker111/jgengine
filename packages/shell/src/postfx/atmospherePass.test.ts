import { expect, test } from "bun:test";
import * as THREE from "three";

import { DEFAULT_ATMOSPHERE } from "@jgengine/core/render/postProcessing";
import { resolveMood } from "@jgengine/core/render/lookMood";

import { buildPostGraph, disposeGraph, planPostStages, resolveAtmosphereStage } from "./PostProcessing";
import { AtmospherePass, atmosphereFragment, findHazeLamps, MAX_HAZE_LAMPS, nearestHazeLamps, sunShaftVisibility } from "./atmospherePass";

test("shafts show for a sun on screen and fade past the edges, behind the camera and below the horizon", () => {
  expect(sunShaftVisibility({ x: 0.5, y: 0.6 }, true, 0.5)).toBe(1);
  expect(sunShaftVisibility({ x: 1.1, y: 0.6 }, true, 0.5)).toBeCloseTo(1 - 0.1 / 0.35);
  expect(sunShaftVisibility({ x: 2, y: 0.6 }, true, 0.5)).toBe(0);
  expect(sunShaftVisibility({ x: 0.5, y: 0.6 }, false, 0.5)).toBe(0);
  expect(sunShaftVisibility({ x: 0.5, y: 0.6 }, true, -0.1)).toBe(0);
});

test("the atmosphere fills unset fields from the defaults and drops out when empty or off", () => {
  expect(resolveAtmosphereStage(undefined, true)).toEqual(DEFAULT_ATMOSPHERE);
  expect(resolveAtmosphereStage({ shafts: 0.6 }, true)).toEqual({ ...DEFAULT_ATMOSPHERE, shafts: 0.6 });
  expect(resolveAtmosphereStage({ fogDensity: 0, shafts: 0 }, true)).toBeNull();
  expect(resolveAtmosphereStage(false, true)).toBeNull();
  expect(resolveAtmosphereStage(undefined, false)).toBeNull();
});

test("each mood carries its own air: overcast hazes without shafts, dusk has the most of both", () => {
  const overcast = resolveMood("overcast").postProcessing.atmosphere;
  const dusk = resolveMood("dusk").postProcessing.atmosphere;
  const bright = resolveMood("bright").postProcessing.atmosphere;
  expect(overcast).toMatchObject({ shafts: 0 });
  expect(dusk && dusk.shafts).toBeGreaterThan(bright && bright.shafts ? bright.shafts : 0);
  expect(dusk && dusk.fogDensity).toBeGreaterThan(bright && bright.fogDensity ? bright.fogDensity : 0);
});

test("the march loop is unrolled to the tier's sample count", () => {
  expect(atmosphereFragment(16)).toContain("i < 16;");
});

const stubRenderer = () =>
  ({
    getPixelRatio: () => 1,
    getSize: (target: THREE.Vector2) => target.set(8, 8),
  }) as unknown as THREE.WebGLRenderer;

test("the atmosphere runs on medium and up, after contact shadows, off on low", () => {
  const authored = { ao: false as const, bloom: false as const, grade: false as const, autoExposure: false as const, aa: false as const };
  expect(planPostStages(authored, "low").atmosphere).toBeNull();
  const plan = planPostStages(authored, "medium");
  expect(plan.atmosphereSteps).toBe(16);
  const graph = buildPostGraph(stubRenderer(), new THREE.Scene(), new THREE.PerspectiveCamera(), plan, 320, 180);
  expect(graph.stages.slice(0, 2)).toEqual(["contactShadows", "atmosphere"]);
  const pass = graph.composer.passes.find((candidate) => candidate instanceof AtmospherePass) as AtmospherePass;
  expect(pass.needsSwap).toBe(false);
  expect(pass.material.uniforms.tDepth!.value).toBe(graph.composer.renderTarget1.depthTexture);
  disposeGraph(graph);
});

test("lamps glow in the haze: nearest first, dark and far lamps skipped, at most the cap", () => {
  const scene = new THREE.Scene();
  const near = new THREE.PointLight(0xffffff, 2, 8);
  near.position.set(1, 2, 0);
  const far = new THREE.SpotLight(0xffaa66, 3, 4);
  far.position.set(30, 2, 0);
  const dark = new THREE.PointLight(0xffffff, 0, 8);
  const optedOut = new THREE.PointLight(0xffffff, 2, 8);
  optedOut.userData.haze = false;
  const mid = new THREE.SpotLight(0xffffff, 2, 10);
  mid.position.set(5, 2, 0);
  scene.add(near, far, dark, optedOut, mid);
  for (let i = 0; i < MAX_HAZE_LAMPS + 4; i += 1) {
    const extra = new THREE.PointLight(0xffffff, 1, 40);
    extra.position.set(8 + i, 2, 0);
    scene.add(extra);
  }
  scene.updateMatrixWorld(true);
  const lamps = findHazeLamps(scene);
  expect(lamps).not.toContain(optedOut);
  const nearest = nearestHazeLamps(lamps, new THREE.Vector3(0, 2, 0));
  expect(nearest).toHaveLength(MAX_HAZE_LAMPS);
  expect(nearest[0]).toBe(near);
  expect(nearest[1]).toBe(mid);
  expect(nearest).not.toContain(dark);
  expect(nearest).not.toContain(far);
});

test("a sunless scene skips the pass unless the atmosphere is marked indoor", () => {
  const camera = new THREE.PerspectiveCamera();
  const renderer = () => {
    const counter = { drew: 0 };
    const stub = { setRenderTarget: () => {}, render: () => { counter.drew += 1; }, getRenderTarget: () => null, autoClear: true } as unknown as THREE.WebGLRenderer;
    return { counter, stub };
  };
  const frame = new THREE.WebGLRenderTarget(8, 8);
  const outdoor = new AtmospherePass(new THREE.Scene(), camera, new THREE.DepthTexture(8, 8), { ...DEFAULT_ATMOSPHERE }, 16);
  const outdoorRender = renderer();
  outdoor.render(outdoorRender.stub, frame, frame, 0, false);
  expect(outdoorRender.counter.drew).toBe(0);
  expect(resolveAtmosphereStage({ indoor: true }, true)).toMatchObject({ indoor: true, lamps: 1 });
  outdoor.dispose();
  frame.dispose();
});

test("a sunless interior still renders its haze and writes the lamps it glows around", () => {
  const scene = new THREE.Scene();
  const lamp = new THREE.SpotLight(0xffeecc, 4, 10, Math.PI / 5);
  lamp.position.set(0, 3, -2);
  lamp.target.position.set(0, 0, -2);
  scene.add(lamp, lamp.target);
  scene.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1.6, 2);
  camera.updateMatrixWorld(true);
  const settings = { ...DEFAULT_ATMOSPHERE, fogDensity: 0.05, lamps: 1.5, indoor: true };
  const pass = new AtmospherePass(scene, camera, new THREE.DepthTexture(8, 8), settings, 16);
  let drew = 0;
  const renderer = { setRenderTarget: () => {}, render: () => { drew += 1; }, getRenderTarget: () => null, autoClear: true } as unknown as THREE.WebGLRenderer;
  const frame = new THREE.WebGLRenderTarget(8, 8);
  pass.render(renderer, frame, frame, 0, false);
  const uniforms = pass.material.uniforms;
  expect(drew).toBeGreaterThan(0);
  expect(uniforms.uSunVisible!.value).toBe(0);
  expect(uniforms.uLampCount!.value).toBe(1);
  expect(uniforms.uLampStrength!.value).toBe(1.5);
  const spot = uniforms.uLampSpot!.value[0] as THREE.Vector4;
  expect(spot.y).toBeCloseTo(-1);
  expect(spot.w).toBeCloseTo(Math.cos(Math.PI / 5));
  expect(atmosphereFragment(16)).toContain("lampScatter");
  pass.dispose();
  frame.dispose();
});
