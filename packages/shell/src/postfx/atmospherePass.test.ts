import { expect, test } from "bun:test";
import * as THREE from "three";

import { DEFAULT_ATMOSPHERE } from "@jgengine/core/render/postProcessing";
import { resolveMood } from "@jgengine/core/render/lookMood";

import { buildPostGraph, disposeGraph, planPostStages, resolveAtmosphereStage } from "./PostProcessing";
import { AtmospherePass, atmosphereFragment, sunShaftVisibility } from "./atmospherePass";

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
