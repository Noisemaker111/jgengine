import { expect, test } from "bun:test";
import * as THREE from "three";
import { EffectComposer } from "three-stdlib";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { DEFAULT_AO } from "@jgengine/core/render/postProcessing";
import { buildPostGraph, disposeGraph, planPostStages, resolveAoStage, syncSize, availablePostfxStages } from "./PostProcessing";

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

test("AO runs by default where the tier allows it and authored configs pass through untouched", () => {
  expect(resolveAoStage(undefined, true)).toBe(DEFAULT_AO);
  expect(resolveAoStage(undefined, false)).toBeNull();
  expect(resolveAoStage(false, true)).toBeNull();
  const authored = { intensity: 1.3 };
  expect(resolveAoStage(authored, true)).toBe(authored);
});

const stubRenderer = () =>
  ({
    getPixelRatio: () => 1,
    getSize: (target: THREE.Vector2) => target.set(8, 8),
  }) as unknown as THREE.WebGLRenderer;

const bare = {
  toneMapping: "aces" as const,
  autoExposure: false as const,
  aa: false as const,
  ao: false as const,
  bloom: false as const,
  grade: false as const,
};

test("a stage the config or the tier disables builds no pass, no scene draw and no target", () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const plan = planPostStages(bare, "high", { ao: false, bloom: false, dof: false, smaa: false });
  const graph = buildPostGraph(stubRenderer(), scene, camera, plan, 320, 180);
  syncSize(graph, 320, 180, 1);

  expect(graph.stages).toEqual([]);
  // RenderPass + OutputPass only: nothing else can draw.
  expect(graph.composer.passes).toHaveLength(2);
  // AO and DOF are the only passes that render the scene a second time.
  expect(graph.composer.passes.filter((pass) => (pass as { scene?: unknown }).scene === scene)).toHaveLength(1);
  expect(graph.composer.passes.some((pass) => "gtaoRenderTarget" in pass || "_renderTargetDepth" in pass)).toBe(false);
  disposeGraph(graph);
});

test("a stage the game never authored stays out even when the tier and the player allow it", () => {
  const plan = planPostStages({ ...bare, ao: undefined }, "high", { ao: true, bloom: true, dof: true, smaa: true });
  expect(plan.dof).toBeNull();
  expect(plan.ao).toBe(DEFAULT_AO);
});

test("a settings surface is offered only the stages this chain can build", () => {
  expect(availablePostfxStages(bare)).toEqual([]);
  expect(availablePostfxStages({ ...bare, ao: undefined })).toEqual(["ao"]);
  expect(availablePostfxStages({ ao: {}, bloom: {}, dof: { focus: 12 } })).toEqual(["ao", "bloom", "dof", "smaa"]);
  // The tier's own defaults never take a stage away: the player can raise quality to reach it.
  expect(availablePostfxStages({ ao: false, bloom: false, aa: false })).toEqual([]);
});

test("AO reads the beauty pass depth instead of rendering the scene again", () => {
  const original = globalThis.Image;
  globalThis.Image = class {
    src = "";
    width = 0;
    height = 0;
  } as unknown as typeof Image;
  try {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const plan = planPostStages({ ...bare, ao: undefined, aa: "smaa" }, "high");
    expect(plan.aoGbuffer).toBe("beauty");
    const graph = buildPostGraph(stubRenderer(), scene, camera, plan, 320, 180);
    syncSize(graph, 320, 180, 1);
    const ao = graph.composer.passes.find((pass) => "gtaoRenderTarget" in pass) as unknown as {
      _renderGBuffer: boolean;
      depthTexture: THREE.Texture | null;
      width: number;
      height: number;
    };
    expect(ao._renderGBuffer).toBe(false);
    expect(ao.depthTexture).not.toBeNull();
    // A sampled depth texture cannot come from a multisampled target, so SMAA covers the edges.
    expect(graph.composer.renderTarget1.samples).toBe(0);
    disposeGraph(graph);
  } finally {
    globalThis.Image = original;
  }
});

test("a chain with no SMAA pass keeps AO's own normal prepass", () => {
  const scene = new THREE.Scene();
  const plan = planPostStages({ ...bare, ao: undefined, aa: "smaa" }, "high", { ao: true, bloom: false, dof: false, smaa: false });
  expect(plan.smaa).toBe(false);
  expect(plan.aoGbuffer).toBe("prepass");
  const graph = buildPostGraph(stubRenderer(), scene, new THREE.PerspectiveCamera(), plan, 320, 180);
  const ao = graph.composer.passes.find((pass) => "gtaoRenderTarget" in pass) as unknown as { _renderGBuffer: boolean };
  expect(ao._renderGBuffer).toBe(true);
  disposeGraph(graph);
});

test("an MSAA-only chain keeps AO's own normal prepass, which a multisampled target needs", () => {
  const plan = planPostStages({ ...bare, ao: undefined, aa: "msaa" }, "high");
  expect(plan.aoGbuffer).toBe("prepass");
  expect(plan.samples).toBe(2);
  const graph = buildPostGraph(stubRenderer(), new THREE.Scene(), new THREE.PerspectiveCamera(), plan, 320, 180);
  const ao = graph.composer.passes.find((pass) => "gtaoRenderTarget" in pass) as unknown as { _renderGBuffer: boolean };
  expect(ao._renderGBuffer).toBe(true);
  disposeGraph(graph);
});

test("the AO depth source follows what the chain can sample", () => {
  expect(planPostStages({ ...bare, ao: undefined, aa: false }, "high").aoGbuffer).toBe("beauty");
  expect(planPostStages({ ...bare, ao: undefined, aa: "smaa" }, "high").aoGbuffer).toBe("beauty");
  expect(planPostStages({ ...bare, ao: undefined, aa: "msaa" }, "high").aoGbuffer).toBe("prepass");
});
