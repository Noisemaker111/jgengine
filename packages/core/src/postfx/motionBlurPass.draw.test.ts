import { expect, test } from "bun:test";
import * as THREE from "three";

import { DEFAULT_MOTION_BLUR } from "@jgengine/core/render/postProcessing";
import { MotionBlurPass, motionBlurBodies, motionBlurFragment, motionBlurScale, registerMotionBlurBody } from "./motionBlurPass.draw";

test("blur length follows the shutter at any frame rate and stays bounded through a hitch", () => {
  expect(motionBlurScale(0.5, 1 / 60)).toBeCloseTo(0.5);
  expect(motionBlurScale(0.5, 1 / 120)).toBeCloseTo(1);
  expect(motionBlurScale(0.5, 1 / 30)).toBeCloseTo(0.25);
  expect(motionBlurScale(0.5, 0)).toBe(0);
  expect(motionBlurScale(4, 1 / 1000)).toBe(4);
  expect(motionBlurScale(-1, 1 / 60)).toBe(0);
});

test("a registered body is walked until it unregisters", () => {
  const body = new THREE.Group();
  const release = registerMotionBlurBody(body);
  expect(motionBlurBodies().has(body)).toBe(true);
  release();
  expect(motionBlurBodies().has(body)).toBe(false);
});

test("a dry run draws a plain and a skinned stand-in body, so both velocity programs link before a body moves", () => {
  const pass = new MotionBlurPass(new THREE.PerspectiveCamera(), new THREE.DepthTexture(4, 4), DEFAULT_MOTION_BLUR, 6);
  const target = new THREE.WebGLRenderTarget(4, 4);
  const drawn: string[][] = [];
  const renderer = {
    shadowMap: { autoUpdate: true },
    getClearColor: (color: THREE.Color) => color,
    getClearAlpha: () => 1,
    setClearColor: () => {},
    setRenderTarget: () => {},
    clear: () => {},
    render: (scene: THREE.Object3D) => {
      const kinds: string[] = [];
      for (const child of scene.children) kinds.push(child instanceof THREE.SkinnedMesh ? "skinned" : "plain");
      if (scene instanceof THREE.Scene) drawn.push(kinds);
    },
  } as unknown as THREE.WebGLRenderer;
  try {
    pass.render(renderer, target, target);
    expect(drawn).toEqual([]);
    pass.dry = true;
    pass.render(renderer, target, target);
    expect(drawn).toEqual([["plain", "skinned"]]);
  } finally {
    pass.dispose();
    target.dispose();
  }
});

test("the blur shader takes as many taps as the tier pays for", () => {
  expect(motionBlurFragment(6)).toContain("i < 6");
  expect(motionBlurFragment(12)).toContain("/ 12.0");
});
