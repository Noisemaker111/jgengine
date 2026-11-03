import { expect, test } from "bun:test";
import * as THREE from "three";

import { buildPostGraph, disposeGraph, planPostStages } from "./PostProcessing.draw";
import { BeautyPass } from "./beautyPass.draw";
import { JitteredRenderPass, TemporalAaPass, halton, taaJitter } from "./temporalAaPass.draw";

test("halton walks the low-discrepancy sequence", () => {
  expect([1, 2, 3, 4].map((index) => halton(index, 2))).toEqual([0.5, 0.25, 0.75, 0.125]);
  expect(halton(1, 3)).toBeCloseTo(1 / 3);
  expect(halton(2, 3)).toBeCloseTo(2 / 3);
});

test("the jitter stays inside one pixel and repeats every 8 frames", () => {
  const seen = new Set<string>();
  for (let frame = 0; frame < 8; frame += 1) {
    const [x, y] = taaJitter(frame);
    expect(Math.abs(x)).toBeLessThan(0.5);
    expect(Math.abs(y)).toBeLessThan(0.5);
    seen.add(`${x},${y}`);
    expect(taaJitter(frame + 8)).toEqual([x, y]);
  }
  expect(seen.size).toBe(8);
});

const stubRenderer = () =>
  ({
    getPixelRatio: () => 1,
    getSize: (target: THREE.Vector2) => target.set(8, 8),
  }) as unknown as THREE.WebGLRenderer;

test("a TAA chain jitters the beauty render and resolves after the other stages", () => {
  const plan = planPostStages({ ao: false, bloom: false, grade: false, autoExposure: false, contactShadows: false }, "high");
  expect(plan.taa).toBe(true);
  const graph = buildPostGraph(stubRenderer(), new THREE.Scene(), new THREE.PerspectiveCamera(), plan, 320, 180);
  const passes = graph.composer.passes;
  const beauty = passes[0] as BeautyPass;
  expect(beauty).toBeInstanceOf(BeautyPass);
  expect(beauty.scenePass).toBeInstanceOf(JitteredRenderPass);
  expect(passes.some((pass) => pass instanceof TemporalAaPass)).toBe(true);
  expect(beauty.target.depthTexture).not.toBeNull();
  disposeGraph(graph);
});
