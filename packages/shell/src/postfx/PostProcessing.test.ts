import { expect, test } from "bun:test";
import * as THREE from "three";
import { EffectComposer } from "three-stdlib";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { disposeGraph, syncSize } from "./PostProcessing";

test("graph resizes and disposes the current Three Bokeh through its pass lifecycle", () => {
  const renderer = {
    getPixelRatio: () => 1,
    getSize: (target: THREE.Vector2) => target.set(8, 8),
  } as THREE.WebGLRenderer;
  const composer = new EffectComposer(renderer);
  const dof = new BokehPass(new THREE.Scene(), new THREE.PerspectiveCamera(), {});
  const sizes: [number, number][] = [];
  const setSize = dof.setSize.bind(dof);
  dof.setSize = (width, height) => {
    sizes.push([width, height]);
    setSize(width, height);
  };
  let disposals = 0;
  const dispose = dof.dispose.bind(dof);
  dof.dispose = () => {
    disposals++;
    dispose();
  };
  let materialDisposals = 0;
  dof.materialBokeh.addEventListener("dispose", () => materialDisposals++);
  composer.addPass(dof);
  const graph = { composer, grade: null };
  syncSize(graph, 320, 180, 2);
  expect(sizes.at(-1)).toEqual([640, 360]);
  syncSize(graph, 180, 320, 1);
  expect(sizes.at(-1)).toEqual([180, 320]);
  disposeGraph(graph);
  expect(disposals).toBe(1);
  expect(materialDisposals).toBe(1);
});
