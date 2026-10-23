import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer, RenderPass, UnrealBloomPass, type ShaderPass } from "three-stdlib";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";

import {
  DEFAULT_AO,
  type AoConfig,
  type BloomConfig,
  type DofConfig,
  type GradeConfig,
  type PostProcessingConfig,
  type StylizeConfig,
  type ToneMappingMode,
} from "@jgengine/core/render/postProcessing";
import {
  adaptExposure,
  DEFAULT_AUTO_EXPOSURE,
  exposureForKey,
  keyLuminanceFromSamples,
  type AutoExposureConfig,
} from "@jgengine/core/render/colorPipeline";
import type { GraphicsQuality } from "@jgengine/core/settings/settingsModel";

import { ExposureMeterPass } from "./autoExposure";
import { createGradePass } from "./gradeShader";
import { releasePostfxOverlayTracking } from "./postfxOverlay";
import { StylizePass } from "./stylizePass";
import { renderShadowlessPrepass } from "./shadowPrepass";

/**
 * GTAO renders the scene with an `overrideMaterial` normal/depth prepass when it has no GBuffer,
 * which stamps transparent overlay quads (additive VFX sprites, telegraphs, debug gizmos) into the
 * AO buffers as opaque squares — the AO composite then multiplies them toward black. Hide marked
 * overlay subtrees for the whole pass: the beauty buffer it composites over was already rendered
 * with them in. A chain whose AO reads the beauty pass's own depth buffer draws no prepass, so
 * nothing is stamped and the cached hide list is empty.
 */
/**
 * GTAO's own `_overrideVisibility` walks the whole scene to hide points and lines before its normal
 * render. `renderShadowlessPrepass` already hides the same set from a cached list, so that walk is
 * skipped here; three only fills its cache with objects it hid, so leaving it empty restores nothing.
 * The hooks are optional: a three version without them leaves the walk in place.
 * @internal
 */
export type GtaoVisibilityHooks = {
  _overrideVisibility?: () => void;
  _restoreVisibility?: () => void;
};

/** Point three's GTAO pass at the prepass that already hid its points and lines. @internal */
export function skipGtaoVisibilityWalk(pass: object): boolean {
  const hooks = pass as GtaoVisibilityHooks;
  if (typeof hooks._overrideVisibility !== "function" || typeof hooks._restoreVisibility !== "function") return false;
  const restore = hooks._restoreVisibility;
  hooks._overrideVisibility = () => {};
  hooks._restoreVisibility = () => {
    // three's restore only touches its own cache, which stays empty while the walk is skipped.
    restore.call(pass);
  };
  return true;
}

class OverlayAwareGTAOPass extends GTAOPass {
  private readonly hiddenOverlays: THREE.Object3D[] = [];

  constructor(scene: THREE.Scene, camera: THREE.Camera, width?: number, height?: number) {
    super(scene, camera, width, height);
    skipGtaoVisibilityWalk(this);
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ): void {
    const rendersGbuffer = (this as unknown as { _renderGBuffer?: boolean })._renderGBuffer !== false;
    if (!rendersGbuffer) {
      super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
      return;
    }
    renderShadowlessPrepass(renderer, this.scene, this.hiddenOverlays, () =>
      super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive), true);
  }
}

/** DOF's depth prepass has the same `overrideMaterial` overlay-stamping problem as GTAO. */
class OverlayAwareBokehPass extends BokehPass {
  private readonly hiddenOverlays: THREE.Object3D[] = [];

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ): void {
    renderShadowlessPrepass(renderer, this.scene, this.hiddenOverlays, () =>
      super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive));
  }
}

const TONE_MAPPING: Record<ToneMappingMode, THREE.ToneMapping> = {
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  cineon: THREE.CineonToneMapping,
  linear: THREE.LinearToneMapping,
  none: THREE.NoToneMapping,
};

/** A post chain stage that costs its own draws; the plan names the ones a chain actually builds. @internal */
export type PostfxStage = "ao" | "bloom" | "dof" | "smaa" | "exposure" | "stylize" | "grade";

/** What one chain will build, resolved from the game's config, the tier and the player's toggles. @internal */
export interface PostfxStagePlan {
  /** MSAA samples on the composer's beauty target: 2 unless AA is off or MSAA-only. */
  samples: number;
  ao: AoConfig | null;
  aoSamples: number;
  /**
   * Where AO's depth and normals come from. `"beauty"` reads the composer's own depth buffer, so the
   * stage draws nothing; `"prepass"` renders the scene again for a normal buffer, which is only
   * needed when the beauty target is multisampled and its depth cannot be sampled.
   *
   * The prepass was the whole price of the stage: 537 extra draws and 2.6-2.9 ms/frame in Harbor
   * Heat, 2,105 extra draws in Drift Foundry (1600x900, RTX 3070). The beauty target is therefore
   * single-sampled whenever AO reads it, so an `aa: "smaa"` chain keeps SMAA's edge resolve without
   * the extra MSAA one; `aa: "msaa"` has no other antialiasing and keeps the prepass.
   */
  aoGbuffer: "beauty" | "prepass";  bloom: BloomConfig | null;
  dof: DofConfig | null;
  smaa: boolean;
  autoExposure: AutoExposureConfig | null;
  stylize: StylizeConfig | null;
  grade: GradeConfig | null;
  /** The authored exposure the meter corrects around. */
  exposure: number;
}

interface BuiltGraph {
  composer: EffectComposer;
  grade: ShaderPass | null;
  /** Stages this chain actually built, in pass order. A stage absent here costs no draw. */
  stages: readonly PostfxStage[];
}

/**
 * Rounds an adapted exposure to 1/32 of a stop. Without it the sky's display-colour cache (which keys
 * off the renderer's exposure) re-solves its swatches every frame the meter nudges.
 * @internal
 */
export function quantizeExposure(value: number): number {
  return Math.round(value * 32) / 32;
}

/** Release each pass and the composer's owned targets. @internal */
export function disposeGraph(built: BuiltGraph): void {
  for (const pass of built.composer.passes) pass.dispose();
  built.composer.dispose();
}

/** Resize the composer and its passes at the renderer's pixel ratio. @internal */
export function syncSize(built: BuiltGraph, width: number, height: number, pixelRatio: number): void {
  built.composer.setPixelRatio(pixelRatio);
  built.composer.setSize(width, height);
}

/** AO the chain runs: authored config, {@link DEFAULT_AO} when unset, null when off or the tier skips it. @internal */
export function resolveAoStage(ao: PostProcessingConfig["ao"], tierAllowsAo: boolean): AoConfig | null {
  if (!tierAllowsAo || ao === false) return null;
  return ao ?? DEFAULT_AO;
}

/** The stages one chain asks for, before any pass is built. Pure data. @internal */
export function planPostStages(
  config: PostProcessingConfig,
  quality: GraphicsQuality = "high",
  stages?: { ao: boolean; bloom: boolean; dof: boolean; smaa: boolean },
): PostfxStagePlan {
  const aa = config.aa === undefined ? "smaa" : config.aa;
  const tierStages = stages ?? { ao: quality === "high", bloom: true, dof: quality === "high", smaa: true };
  const ao = resolveAoStage(config.ao, tierStages.ao);
  const authoredDof = tierStages.dof && config.dof !== undefined && config.dof !== false ? config.dof : null;
  const bloom = tierStages.bloom && config.bloom !== false ? (config.bloom ?? {}) : null;
  const smaa = tierStages.smaa && aa === "smaa";
  return {
    samples: aa === false ? 0 : 2,
    ao,
    aoSamples: quality === "ultra" ? 16 : quality === "high" ? 12 : 8,
    aoGbuffer: smaa || aa === false ? "beauty" : "prepass",
    bloom,
    dof: authoredDof === null ? null : { ...authoredDof, aperture: authoredDof.aperture ?? (quality === "high" ? 0.00025 : 0.00012) },
    smaa,
    autoExposure: config.autoExposure === false ? null : { ...DEFAULT_AUTO_EXPOSURE, ...(config.autoExposure ?? {}) },
    stylize: config.stylize !== undefined && config.stylize !== false ? config.stylize : null,
    grade: config.grade !== false ? (config.grade ?? {}) : null,
    exposure: config.exposure ?? 1,
  };
}

/** The stage toggles a settings surface may offer; each is a pass a chain can either build or skip. @internal */
export type PostfxToggleStage = "ao" | "bloom" | "dof" | "smaa";

/**
 * The toggle stages a chain built from `config` can contain on its most permissive tier, with the
 * player's own toggles ignored. A row for any other stage switches a pass the chain never builds, so
 * nothing the player picks reaches the screen.
 * @internal
 */
export function availablePostfxStages(config: PostProcessingConfig): readonly PostfxToggleStage[] {
  const plan = planPostStages(config, "high", { ao: true, bloom: true, dof: true, smaa: true });
  const stages: PostfxToggleStage[] = [];
  if (plan.ao !== null) stages.push("ao");
  if (plan.bloom !== null) stages.push("bloom");
  if (plan.dof !== null) stages.push("dof");
  if (plan.smaa) stages.push("smaa");
  return stages;
}

/**
 * Build the composer for a plan. A stage the plan left out adds no pass, so it draws nothing and
 * allocates no render target.
 * @internal
 */
export function buildPostGraph(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  plan: PostfxStagePlan,
  width: number,
  height: number,
): BuiltGraph {
  const beautyDepth = plan.ao !== null && plan.aoGbuffer === "beauty" ? new THREE.DepthTexture(width, height) : null;
  const target = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    samples: beautyDepth === null ? plan.samples : 0,
    ...(beautyDepth === null ? {} : { depthTexture: beautyDepth }),
  });
  const composer = new EffectComposer(gl, target);
  const built: PostfxStage[] = [];
  composer.addPass(new RenderPass(scene, camera));

  if (plan.ao !== null) {
    const ao = new OverlayAwareGTAOPass(scene, camera, width, height);
    if (beautyDepth !== null) ao.setGBuffer(beautyDepth);
    ao.blendIntensity = plan.ao.blend ?? 1;
    ao.updateGtaoMaterial({
      radius: plan.ao.radius ?? 1.8,
      distanceExponent: 1,
      thickness: plan.ao.distanceFalloff ?? 3.6,
      scale: plan.ao.intensity ?? 2.4,
      samples: plan.aoSamples,
    });
    composer.addPass(ao);
    built.push("ao");
  }

  if (plan.bloom !== null) {
    composer.addPass(
      new UnrealBloomPass(
        new THREE.Vector2(width, height),
        plan.bloom.strength ?? 0.32,
        plan.bloom.radius ?? 0.55,
        plan.bloom.threshold ?? 0.85,
      ),
    );
    built.push("bloom");
  }

  if (plan.dof !== null) {
    const dof = new OverlayAwareBokehPass(scene, camera, {
      focus: plan.dof.focus ?? 18,
      aperture: plan.dof.aperture ?? 0.00025,
      maxblur: plan.dof.maxBlur ?? 0.01,
    });
    composer.addPass(dof);
    built.push("dof");
  }

  // SMAA must run before OutputPass (linear-sRGB). Default on for post chains.
  if (plan.smaa) {
    composer.addPass(new SMAAPass());
    built.push("smaa");
  }

  // Clamped auto-exposure meters the pre-tone-map buffer, so the meter sits before OutputPass and
  // hands the adaptation to the renderer's exposure — the one value the sky swatches also read.
  const authoredExposure = plan.exposure;
  if (plan.autoExposure !== null) {
    const autoExposure = plan.autoExposure;
    let current = authoredExposure;
    let sampled = false;
    composer.addPass(
      new ExposureMeterPass((samples, seconds) => {
        const target = authoredExposure * exposureForKey(keyLuminanceFromSamples(samples), autoExposure);
        // The first sample lands on its own target; fading in from the authored exposure would
        // open every load on a visible exposure slideshow.
        current = sampled ? adaptExposure(current, target, seconds, autoExposure.adaptationSeconds) : target;
        sampled = true;
        gl.toneMappingExposure = quantizeExposure(current);
      }),
    );
    built.push("exposure");
  }

  composer.addPass(new OutputPass());

  if (plan.stylize !== null) {
    composer.addPass(new StylizePass(scene, camera, plan.stylize));
    built.push("stylize");
  }

  let grade: ShaderPass | null = null;
  if (plan.grade !== null) {
    grade = createGradePass(plan.grade);
    composer.addPass(grade);
    built.push("grade");
  }

  return { composer, grade, stages: built };
}

/**
 * Mounts an `EffectComposer` inside the shell Canvas and takes over rendering
 * (priority-1 `useFrame`, which disables R3F auto-render) to run the configured
 * post chain: RenderPass → GTAO → UnrealBloom → SMAA → exposure meter → OutputPass → Stylize → Grade. Rendered only
 * when `PlayableGame.postProcessing` is set, so games without it draw unchanged.
 *
 * `stages` (resolved from the player's graphics profile) controls expensive passes
 * independently. Medium keeps AO and DOF with reduced AO sampling; low can disable
 * them while retaining cheaper bloom, SMAA, tone mapping, and grade stages. A stage
 * that is off adds no pass at all, so it costs no draw and allocates no target.
 */
export function PostProcessing({ config, quality = "high", stages }: { config: PostProcessingConfig; quality?: GraphicsQuality; stages?: { ao: boolean; bloom: boolean; dof: boolean; smaa: boolean } }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  const builtRef = useRef<BuiltGraph | null>(null);

  useEffect(() => {
    const width = Math.max(1, size.width);
    const height = Math.max(1, size.height);
    const graph = buildPostGraph(gl, scene, camera, planPostStages(config, quality, stages), width, height);
    syncSize(graph, width, height, gl.getPixelRatio());
    builtRef.current = graph;
    return () => {
      disposeGraph(graph);
      releasePostfxOverlayTracking(scene);
      builtRef.current = null;
    };
  }, [gl, scene, camera, config, quality, stages]);

  useEffect(() => {
    const prevTone = gl.toneMapping;
    const prevExposure = gl.toneMappingExposure;
    gl.toneMapping = TONE_MAPPING[config.toneMapping ?? "agx"];
    gl.toneMappingExposure = config.exposure ?? 1;
    return () => {
      gl.toneMapping = prevTone;
      gl.toneMappingExposure = prevExposure;
    };
  }, [gl, config.toneMapping, config.exposure]);

  useEffect(() => {
    const built = builtRef.current;
    if (built === null) return;
    syncSize(built, Math.max(1, size.width), Math.max(1, size.height), gl.getPixelRatio());
  }, [gl, size.width, size.height]);

  useFrame((_, delta) => {
    const built = builtRef.current;
    if (built === null) return;
    if (built.grade !== null) built.grade.uniforms.uTime.value += delta;
    built.composer.render(delta);
  }, 1);

  return null;
}
