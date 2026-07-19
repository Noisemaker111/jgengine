import { describe, expect, test } from "bun:test";

import {
  boundsCenter,
  clampPitchDeg,
  frameDistanceForBounds,
  orbitCameraPosition,
} from "./orbitFraming";

const near = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) <= eps;

describe("orbitCameraPosition", () => {
  test("straight-down aerial (pitch 90) sits directly above the target at `distance`", () => {
    const pos = orbitCameraPosition({ target: { x: 5, y: 2, z: -3 }, distance: 40, pitchDeg: 90 });
    expect(near(pos.x, 5)).toBe(true);
    expect(near(pos.z, -3)).toBe(true);
    expect(near(pos.y, 42)).toBe(true);
  });

  test("level pitch (0) pulls straight back along +Z with no height gain", () => {
    const pos = orbitCameraPosition({ target: { x: 0, y: 0, z: 0 }, distance: 10, pitchDeg: 0 });
    expect(near(pos.x, 0)).toBe(true);
    expect(near(pos.y, 0)).toBe(true);
    expect(near(pos.z, 10)).toBe(true);
  });

  test("distance is the true radius from the target at any pitch", () => {
    const target = { x: 1, y: 1, z: 1 };
    const pos = orbitCameraPosition({ target, distance: 25, pitchDeg: 55, yawDeg: 30 });
    const r = Math.hypot(pos.x - target.x, pos.y - target.y, pos.z - target.z);
    expect(near(r, 25, 1e-4)).toBe(true);
  });

  test("yaw rotates the camera around the target in the XZ plane", () => {
    const pos = orbitCameraPosition({ target: { x: 0, y: 0, z: 0 }, distance: 10, pitchDeg: 0, yawDeg: 90 });
    expect(near(pos.x, 10, 1e-4)).toBe(true);
    expect(near(pos.z, 0, 1e-4)).toBe(true);
  });

  test("explicit height overrides the pitch-derived vertical offset", () => {
    const pos = orbitCameraPosition({ target: { x: 0, y: 0, z: 0 }, distance: 10, pitchDeg: 90, height: 3 });
    expect(near(pos.y, 3)).toBe(true);
  });

  test("distance 0 is clamped so the camera never collapses onto the target", () => {
    const pos = orbitCameraPosition({ target: { x: 0, y: 0, z: 0 }, distance: 0, pitchDeg: 45 });
    const r = Math.hypot(pos.x, pos.y, pos.z);
    expect(r).toBeGreaterThan(0);
  });

  test("clampPitchDeg keeps pitch within the horizon..overhead range", () => {
    expect(clampPitchDeg(120)).toBe(90);
    expect(clampPitchDeg(-30)).toBe(0);
    expect(clampPitchDeg(Number.NaN)).toBe(45);
  });
});

describe("frameDistanceForBounds", () => {
  const bounds = { min: { x: -50, y: 0, z: -50 }, max: { x: 50, y: 10, z: 50 } };

  test("bigger regions need more pull-back", () => {
    const small = frameDistanceForBounds({ min: { x: -5, y: 0, z: -5 }, max: { x: 5, y: 0, z: 5 } });
    const big = frameDistanceForBounds(bounds);
    expect(big).toBeGreaterThan(small);
  });

  test("a narrower FOV requires standing further back", () => {
    const wide = frameDistanceForBounds(bounds, { fovDeg: 90 });
    const narrow = frameDistanceForBounds(bounds, { fovDeg: 30 });
    expect(narrow).toBeGreaterThan(wide);
  });

  test("boundsCenter is the midpoint", () => {
    expect(boundsCenter(bounds)).toEqual({ x: 0, y: 5, z: 0 });
  });

  test("the fit distance clears the region radius so the aerial does not clip it", () => {
    const distance = frameDistanceForBounds(bounds, { fovDeg: 50, margin: 1.25 });
    const radius = Math.hypot(50, 50) + 5;
    expect(distance).toBeGreaterThan(radius);
  });
});
