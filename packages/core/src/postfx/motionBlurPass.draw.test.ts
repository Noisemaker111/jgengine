import { expect, test } from "bun:test";
import * as THREE from "three";

import { motionBlurBodies, motionBlurFragment, motionBlurScale, registerMotionBlurBody } from "./motionBlurPass.draw";

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

test("the blur shader takes as many taps as the tier pays for", () => {
  expect(motionBlurFragment(6)).toContain("i < 6");
  expect(motionBlurFragment(12)).toContain("/ 12.0");
});
