import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { EffectComposer } from "three-stdlib";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { DEFAULT_AO } from "@jgengine/core/render/postProcessing";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { advanceRevealFade, buildPostGraph, disposeGraph, planPostStages, resolveAoStage, showEffects, startRevealFade, syncSize, availablePostfxStages } from "./PostProcessing.draw";
import { ExposureMeterPass } from "./autoExposure.draw";
import { RevealFadePass, RevealSnapshotPass } from "./revealFade.draw";
import { JitteredRenderPass, TemporalAaPass } from "./temporalAaPass.draw";

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
  const graph = { composer, grade: null, resolutionScale: 1 };
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
  contactShadows: false as const,
  atmosphere: false as const,
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
  expect(availablePostfxStages({ ao: {}, bloom: {}, dof: { focus: 12 } })).toEqual(["ao", "bloom", "dof", "smaa", "fog"]);
  expect(availablePostfxStages({ ...bare, ssr: {}, motionBlur: {} })).toEqual(["ssr", "motionBlur"]);
  // The tier's own defaults never take a stage away: the player can raise quality to reach it.
  expect(availablePostfxStages({ ao: false, bloom: false, aa: false })).toEqual(["fog"]);
  expect(availablePostfxStages({ ao: false, bloom: false, aa: false, atmosphere: false })).toEqual([]);
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

test("a lower tier builds fewer passes and renders them into a smaller target", () => {
  const originalImage = globalThis.Image;
  globalThis.Image = class {
    src = "";
    width = 0;
    height = 0;
  } as unknown as typeof Image;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const authored = { toneMapping: "aces" as const, ao: undefined, bloom: {}, dof: { focus: 12 } };
  const built = (quality: "low" | "medium" | "high" | "ultra") => {
    const plan = planPostStages(authored, quality);
    const graph = buildPostGraph(stubRenderer(), scene, camera, plan, 320, 180);
    syncSize(graph, 320, 180, 1);
    return graph;
  };
  const low = built("low");
  const medium = built("medium");
  const high = built("high");
  const ultra = built("ultra");
  try {
    expect(high.stages).toEqual(["ao", "contactShadows", "atmosphere", "bloom", "dof", "taa", "exposure", "grade"]);
    expect(medium.stages).toEqual(["ao", "contactShadows", "atmosphere", "bloom", "dof", "smaa", "exposure", "grade"]);
    expect(low.stages).toEqual(["bloom", "smaa", "exposure", "grade"]);
    expect(low.composer.passes.length).toBeLessThan(high.composer.passes.length);
    expect(high.composer.renderTarget1.width).toBe(320);
    expect(medium.composer.renderTarget1.width).toBeLessThan(high.composer.renderTarget1.width);
    expect(low.composer.renderTarget1.width).toBeLessThan(medium.composer.renderTarget1.width);
    expect(low.composer.renderTarget1.height).toBe(126);
    expect(ultra.composer.renderTarget1.width).toBe(high.composer.renderTarget1.width);
    // A resize re-applies the tier's scale instead of snapping back to native.
    syncSize(low, 640, 360, 1);
    expect(low.composer.renderTarget1.width).toBe(448);
  } finally {
    for (const graph of [low, medium, high, ultra]) disposeGraph(graph);
    globalThis.Image = originalImage;
  }
});

describe("effects after the reveal", () => {
  const withImage = <T,>(run: () => T): T => {
    const original = globalThis.Image;
    globalThis.Image = class {
      src = "";
      width = 0;
      height = 0;
    } as unknown as typeof Image;
    try {
      return run();
    } finally {
      globalThis.Image = original;
    }
  };
  const fullChain = () =>
    withImage(() => buildPostGraph(stubRenderer(), new THREE.Scene(), new THREE.PerspectiveCamera(), planPostStages({ toneMapping: "aces", ao: undefined, bloom: {} }, "high"), 320, 180));

  test("a chain starts with only the beauty pass, the exposure meter, the OutputPass and the grade on", () => {
    const graph = fullChain();
    const on = graph.composer.passes.filter((pass) => pass.enabled);
    expect(on).toHaveLength(4);
    expect(on[0]).toBeInstanceOf(JitteredRenderPass);
    expect(on[1]).toBeInstanceOf(ExposureMeterPass);
    expect(on[2]).toBeInstanceOf(OutputPass);
    expect(on[3]).toBe(graph.grade!);
    expect(graph.effects.length).toBe(graph.stages.length - 2);
    expect(graph.composer.passes[1]).toBeInstanceOf(RevealSnapshotPass);
    // The fade sits right before the grade, so the grade lands on both pictures alike.
    expect(graph.composer.passes.at(-2)).toBeInstanceOf(RevealFadePass);
    disposeGraph(graph);
  });

  test("the fade passes swap no buffers, so the beauty pass keeps drawing into the target whose depth the effects read", () => {
    const graph = fullChain();
    const swaps = () => graph.composer.passes.filter((pass) => pass.enabled && pass.needsSwap).length;
    showEffects(graph, true);
    const full = swaps();
    startRevealFade(graph);
    expect(swaps()).toBe(full);
    disposeGraph(graph);
  });

  test("the effects fade in over about a third of a second, a slow frame included, then the fade passes switch off", () => {
    const graph = fullChain();
    const taa = graph.effects.find((pass): pass is TemporalAaPass => pass instanceof TemporalAaPass)!;
    let resets = 0;
    taa.reset = () => {
      resets += 1;
    };
    startRevealFade(graph);
    expect(graph.effects.every((pass) => pass.enabled)).toBe(true);
    expect(resets).toBe(1);
    const fade = graph.reveal!.fade;
    expect(fade.enabled && graph.reveal!.snapshot.enabled).toBe(true);
    expect(fade.progress).toBe(0);
    // A frame that took a whole second moves the fade one step, not to its end.
    advanceRevealFade(graph, 1);
    expect(fade.progress).toBeGreaterThan(0.1);
    expect(fade.progress).toBeLessThan(0.12);
    let frames = 1;
    while (fade.enabled && frames < 100) {
      advanceRevealFade(graph, 1 / 60);
      frames += 1;
    }
    expect(frames).toBeGreaterThanOrEqual(16);
    expect(frames).toBeLessThanOrEqual(18);
    expect(graph.reveal!.snapshot.enabled).toBe(false);
    expect(graph.effects.every((pass) => pass.enabled)).toBe(true);
    disposeGraph(graph);
  });

  test("a chain with nothing to wait for builds no fade passes", () => {
    const graph = buildPostGraph(stubRenderer(), new THREE.Scene(), new THREE.PerspectiveCamera(), planPostStages(bare, "high", { ao: false, bloom: false, dof: false, smaa: false }), 320, 180);
    expect(graph.reveal).toBeNull();
    expect(graph.composer.passes.every((pass) => pass.enabled)).toBe(true);
    disposeGraph(graph);
  });

  test("the beauty pass jitters only while temporal AA is on to resolve it", () => {
    const graph = fullChain();
    const beauty = graph.composer.passes[0] as JitteredRenderPass;
    const projections: number[][] = [];
    const renderer = {
      autoClear: true,
      setRenderTarget() {},
      clear() {},
      clearDepth() {},
      render(_scene: THREE.Object3D, camera: THREE.Camera) {
        projections.push([...camera.projectionMatrix.elements]);
      },
    } as unknown as THREE.WebGLRenderer;
    const target = new THREE.WebGLRenderTarget(320, 180);
    beauty.render(renderer, target, target);
    showEffects(graph, true);
    beauty.render(renderer, target, target);
    const camera = (beauty as unknown as { camera: THREE.PerspectiveCamera }).camera;
    expect(projections[0]).toEqual([...camera.projectionMatrix.elements]);
    expect(projections[1]).not.toEqual(projections[0]);
    target.dispose();
    disposeGraph(graph);
  });
});

describe("each render effect is off unless the game or its look asks for it", () => {
  const graphStages = (config: Parameters<typeof planPostStages>[0], quality: "low" | "medium" | "high" | "ultra" = "high") => {
    const original = globalThis.Image;
    globalThis.Image = class {
      src = "";
      width = 0;
      height = 0;
    } as unknown as typeof Image;
    try {
      const graph = buildPostGraph(stubRenderer(), new THREE.Scene(), new THREE.PerspectiveCamera(), planPostStages(config, quality), 320, 180);
      const stages = graph.stages;
      disposeGraph(graph);
      return stages;
    } finally {
      globalThis.Image = original;
    }
  };

  test("screen-space reflections build only when authored, and never on low", () => {
    expect(graphStages({ toneMapping: "aces" })).not.toContain("ssr");
    expect(graphStages({ toneMapping: "aces", ssr: false })).not.toContain("ssr");
    expect(graphStages({ toneMapping: "aces", ssr: {} })).toContain("ssr");
    expect(graphStages({ toneMapping: "aces", ssr: {} }, "low")).not.toContain("ssr");
    expect(graphStages({ toneMapping: "aces", ssr: { intensity: 0 } })).not.toContain("ssr");
    expect(planPostStages({ ssr: {} }, "high", { ssr: false }).ssr).toBeNull();
  });

  test("motion blur builds only when authored, and never on low", () => {
    expect(graphStages({ toneMapping: "aces" })).not.toContain("motionBlur");
    expect(graphStages({ toneMapping: "aces", motionBlur: {} })).toContain("motionBlur");
    expect(graphStages({ toneMapping: "aces", motionBlur: {} }, "low")).not.toContain("motionBlur");
    expect(graphStages({ toneMapping: "aces", motionBlur: { camera: 0, objects: 0 } })).not.toContain("motionBlur");
    expect(planPostStages({ motionBlur: {} }, "high", { motionBlur: false }).motionBlur).toBeNull();
  });

  test("volumetric fog keeps an even layer with no drift until the game asks for banks, and the player can turn it off", () => {
    const plain = planPostStages({}, "high");
    expect(plain.atmosphere?.variation).toBe(0);
    expect(plain.fogVariationTaps).toBe(0);
    const banks = planPostStages({ atmosphere: { variation: 0.6, color: "#c8d0d8" } }, "high");
    expect(banks.fogVariationTaps).toBeGreaterThan(0);
    expect(banks.atmosphere?.color).toBe("#c8d0d8");
    expect(planPostStages({ atmosphere: { variation: 0.6 } }, "low").atmosphere).toBeNull();
    expect(planPostStages({}, "high", { fog: false }).atmosphere).toBeNull();
  });

  test("the reflection pass sits before the haze and the blur after depth of field", () => {
    const stages = graphStages({ toneMapping: "aces", ssr: {}, motionBlur: {}, dof: { focus: 10 } });
    expect(stages.indexOf("ssr")).toBeLessThan(stages.indexOf("atmosphere"));
    expect(stages.indexOf("motionBlur")).toBeGreaterThan(stages.indexOf("dof"));
    expect(stages.indexOf("motionBlur")).toBeLessThan(stages.indexOf("taa"));
  });
});
