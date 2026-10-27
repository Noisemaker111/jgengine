// @skill jgengine-world
import { definedOnly } from "../data/definedOnly";
import { requireUniform } from "../render/uniformMaterial.draw";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer, RenderPass, UnrealBloomPass, type Pass, type ShaderPass } from "three-stdlib";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";

import {
  DEFAULT_AO,
  DEFAULT_ATMOSPHERE,
  type AoConfig,
  type AtmosphereConfig,
  type BloomConfig,
  type ContactShadowConfig,
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

import { measureComposerPasses } from "@jgengine/core/devtools/frameBreakdown.draw";
import { linkDrawsOffFrame, sceneRevealed, warmupDraws } from "@jgengine/core/render/shaderWarmup.draw";
import { ExposureMeterPass } from "./autoExposure.draw";
import { AtmospherePass } from "./atmospherePass.draw";
import { ContactShadowPass } from "./contactShadowPass.draw";
import { createGradePass } from "./gradeShader.draw";
import { postfxTierPolicy } from "./postfxTierPolicy";
import { releasePostfxOverlayTracking } from "./postfxOverlay.draw";
import { RevealFadePass, RevealSnapshotPass, stepRevealFade } from "./revealFade.draw";
import { StylizePass } from "./stylizePass.draw";
import { renderShadowlessPrepass } from "./shadowPrepass.draw";
import { JitteredRenderPass, TemporalAaPass } from "./temporalAaPass.draw";

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
export type PostfxStage = "ao" | "contactShadows" | "atmosphere" | "bloom" | "dof" | "smaa" | "taa" | "exposure" | "stylize" | "grade";

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
  aoGbuffer: "beauty" | "prepass";
  /** Contact shadows toward the key light, read from the beauty depth; null when off. */
  contactShadows: ContactShadowConfig | null;
  contactShadowSteps: number;
  /** Height haze and light shafts toward the key light, read from the beauty depth; null when off. */
  atmosphere: Required<AtmosphereConfig> | null;
  atmosphereSteps: number;
  bloom: BloomConfig | null;
  dof: DofConfig | null;
  smaa: boolean;
  /** Temporal AA in place of SMAA; the beauty pass then renders jittered into a single-sampled target. */
  taa: boolean;
  autoExposure: AutoExposureConfig | null;
  stylize: StylizeConfig | null;
  grade: GradeConfig | null;
  /** The authored exposure the meter corrects around. */
  exposure: number;
  /**
   * Composer backing store as a fraction of the canvas. Every stage below `1` — AO, bloom, DOF,
   * SMAA and the beauty pass itself — renders into a smaller target, and the OutputPass stretches it
   * back over the canvas.
   */
  resolutionScale: number;
}

interface BuiltGraph {
  composer: EffectComposer;
  grade: ShaderPass | null;
  /** Stages this chain actually built, in pass order. A stage absent here costs no draw. */
  stages: readonly PostfxStage[];
  /** The plan's {@link PostfxStagePlan.resolutionScale}, kept so a resize re-applies it. */
  resolutionScale: number;
  /**
   * The passes that wait for their programs: every effect between the beauty pass and the grade
   * except the exposure meter and the OutputPass. A chain is built with them off; see {@link showEffects}.
   */
  effects: readonly Pass[];
  /** The passes that fade the effects in, or null for a chain with no effects. */
  reveal: { snapshot: RevealSnapshotPass; fade: RevealFadePass } | null;
}

/**
 * Turn the chain's effects on or off at once. Off, the chain is the beauty pass, the exposure meter,
 * the OutputPass and the grade: the picture a game shows while its effect programs link. Temporal AA
 * starts from a fresh history when it comes back on. @internal
 */
export function showEffects(built: BuiltGraph, on: boolean): void {
  for (const pass of built.effects) {
    if (on && !pass.enabled && pass instanceof TemporalAaPass) pass.reset();
    pass.enabled = on;
  }
}

/** Turn the effects on and fade them in from the frame without them (see `REVEAL_FADE_SECONDS`). @internal */
export function startRevealFade(built: BuiltGraph): void {
  showEffects(built, true);
  if (built.reveal === null) return;
  built.reveal.fade.progress = 0;
  built.reveal.snapshot.enabled = true;
  built.reveal.fade.enabled = true;
}

/** Move the fade on by one drawn frame; the fade passes switch off once it is through. @internal */
export function advanceRevealFade(built: BuiltGraph, delta: number): void {
  const reveal = built.reveal;
  if (reveal === null || !reveal.fade.enabled) return;
  reveal.fade.progress = stepRevealFade(reveal.fade.progress, delta);
  if (reveal.fade.progress < 1) return;
  reveal.snapshot.enabled = false;
  reveal.fade.enabled = false;
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

/**
 * Run the chain once with every draw held, for whatever links its programs: the passes that are on,
 * or with `every` all of them, the effects and their fade included. The exposure meter draws but
 * neither meters nor reads back, and temporal AA forgets the history the run did not really draw,
 * so the first real frame starts where it would have.
 */
function dryRender(built: BuiltGraph, every = false): void {
  const passes = built.composer.passes;
  const meters = passes.filter((pass): pass is ExposureMeterPass => pass instanceof ExposureMeterPass);
  const enabled = passes.map((pass) => pass.enabled);
  for (const meter of meters) meter.dry = true;
  if (every) for (const pass of passes) pass.enabled = true;
  try {
    built.composer.render(0);
  } finally {
    passes.forEach((pass, index) => {
      pass.enabled = enabled[index]!;
    });
    for (const meter of meters) meter.dry = false;
    for (const pass of passes) if (pass instanceof TemporalAaPass) pass.reset();
  }
}

/**
 * Resize the composer and its passes to the plan's share of the renderer's backing store. The
 * scaled size is rounded to whole pixels: a fractional target size reaches `texImage2D` as one.
 * @internal
 */
export function syncSize(built: BuiltGraph, width: number, height: number, pixelRatio: number): void {
  const scale = pixelRatio * built.resolutionScale;
  built.composer.setPixelRatio(1);
  built.composer.setSize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
}

/** AO the chain runs: authored config, {@link DEFAULT_AO} when unset, null when off or the tier skips it. @internal */
export function resolveAoStage(ao: PostProcessingConfig["ao"], tierAllowsAo: boolean): AoConfig | null {
  if (!tierAllowsAo || ao === false) return null;
  return ao ?? DEFAULT_AO;
}

/** Contact shadows the chain runs: authored config, defaults when unset, null when off or the tier skips it. @internal */
export function resolveContactShadowStage(config: PostProcessingConfig["contactShadows"], tierAllows: boolean): ContactShadowConfig | null {
  if (!tierAllows || config === false) return null;
  return config ?? {};
}

/** Atmosphere the chain runs: authored fields over {@link DEFAULT_ATMOSPHERE}, null when off, empty or skipped by the tier. @internal */
export function resolveAtmosphereStage(config: PostProcessingConfig["atmosphere"], tierAllows: boolean): Required<AtmosphereConfig> | null {
  if (!tierAllows || config === false) return null;
  const settings = { ...DEFAULT_ATMOSPHERE, ...definedOnly(config ?? {}) };
  return settings.fogDensity <= 0 && settings.shafts <= 0 ? null : settings;
}

/** The stages one chain asks for, before any pass is built. Pure data. @internal */
export function planPostStages(
  config: PostProcessingConfig,
  quality: GraphicsQuality = "high",
  stages?: { ao: boolean; bloom: boolean; dof: boolean; smaa: boolean },
): PostfxStagePlan {
  const policy = postfxTierPolicy(quality);
  const aa = config.aa === undefined ? (policy.temporalAa ? "taa" : "smaa") : config.aa;
  const tierStages = stages ?? policy.stages;
  const ao = resolveAoStage(config.ao, tierStages.ao);
  const authoredDof = tierStages.dof && config.dof !== undefined && config.dof !== false ? config.dof : null;
  const bloom = tierStages.bloom && config.bloom !== false ? (config.bloom ?? {}) : null;
  const taa = tierStages.smaa && aa === "taa";
  const smaa = tierStages.smaa && aa === "smaa";
  const contactShadows = resolveContactShadowStage(config.contactShadows, policy.contactShadowSteps > 0 && aa !== "msaa");
  const atmosphere = resolveAtmosphereStage(config.atmosphere, policy.atmosphereSteps > 0 && aa !== "msaa");
  const sampledDepth = smaa || taa || aa === false || contactShadows !== null || atmosphere !== null;
  return {
    samples: aa === false || sampledDepth ? 0 : 2,
    ao,
    aoSamples: policy.aoSamples,
    aoGbuffer: sampledDepth ? "beauty" : "prepass",
    contactShadows,
    contactShadowSteps: contactShadows === null ? 0 : policy.contactShadowSteps,
    atmosphere,
    atmosphereSteps: atmosphere === null ? 0 : policy.atmosphereSteps,
    bloom,
    dof: authoredDof === null ? null : { ...authoredDof, aperture: authoredDof.aperture ?? (quality === "high" ? 0.00025 : 0.00012) },
    smaa,
    taa,
    autoExposure: config.autoExposure === false ? null : { ...DEFAULT_AUTO_EXPOSURE, ...(config.autoExposure ?? {}) },
    stylize: config.stylize !== undefined && config.stylize !== false ? config.stylize : null,
    grade: config.grade !== false ? (config.grade ?? {}) : null,
    exposure: config.exposure ?? 1,
    resolutionScale: policy.resolutionScale,
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
  if (plan.smaa || plan.taa) stages.push("smaa");
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
  const needsDepth = (plan.ao !== null && plan.aoGbuffer === "beauty") || plan.contactShadows !== null || plan.atmosphere !== null || plan.taa;
  const beautyDepth = needsDepth ? new THREE.DepthTexture(width, height) : null;
  const target = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    samples: beautyDepth === null ? plan.samples : 0,
    ...(beautyDepth === null ? {} : { depthTexture: beautyDepth }),
  });
  const composer = new EffectComposer(gl, target);
  const built: PostfxStage[] = [];
  const effects: Pass[] = [];
  const effect = (pass: Pass): void => {
    composer.addPass(pass);
    effects.push(pass);
  };
  const taa = plan.taa && beautyDepth !== null ? new TemporalAaPass(camera, beautyDepth, width, height) : null;
  composer.addPass(taa === null ? new RenderPass(scene, camera) : new JitteredRenderPass(scene, camera, taa));

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
    effect(ao);
    built.push("ao");
  }

  if (plan.contactShadows !== null && beautyDepth !== null) {
    effect(new ContactShadowPass(scene, camera, beautyDepth, plan.contactShadows, plan.contactShadowSteps));
    built.push("contactShadows");
  }
  if (plan.atmosphere !== null && beautyDepth !== null) {
    effect(new AtmospherePass(scene, camera, beautyDepth, plan.atmosphere, plan.atmosphereSteps));
    built.push("atmosphere");
  }

  if (plan.bloom !== null) {
    effect(
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
    effect(dof);
    built.push("dof");
  }

  // SMAA must run before OutputPass (linear-sRGB). Default on for post chains.
  if (plan.smaa) {
    effect(new SMAAPass());
    built.push("smaa");
  }
  if (taa !== null) {
    effect(taa);
    built.push("taa");
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
    effect(new StylizePass(scene, camera, plan.stylize));
    built.push("stylize");
  }

  let reveal: BuiltGraph["reveal"] = null;
  if (effects.length > 0) {
    const fade = new RevealFadePass(width, height);
    reveal = { snapshot: new RevealSnapshotPass(fade), fade };
    composer.addPass(fade);
    composer.insertPass(reveal.snapshot, 1);
  }

  let grade: ShaderPass | null = null;
  if (plan.grade !== null) {
    grade = createGradePass(plan.grade);
    composer.addPass(grade);
    built.push("grade");
  }

  const graph: BuiltGraph = { composer, grade, stages: built, resolutionScale: plan.resolutionScale, effects, reveal };
  showEffects(graph, false);
  if (reveal !== null) {
    reveal.snapshot.enabled = false;
    reveal.fade.enabled = false;
  }
  return graph;
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
 * The tier also sets the composer's resolution scale, so the passes a lower tier
 * keeps still cover fewer pixels.
 *
 * The effects wait for the loading cover to lift: under it only the beauty pass, the exposure meter,
 * the OutputPass and the grade link, so the cover lifts sooner. After it the effect programs link
 * off the frame, and once they are ready the effects fade in over a third of a second. A rebuilt
 * chain (a settings change) does the same. `immediate` draws every effect from the first frame,
 * for a single still such as a poster, which has no cover and no next frame to wait for.
 */
export function PostProcessing({
  config,
  quality = "high",
  stages,
  immediate = false,
}: {
  config: PostProcessingConfig;
  quality?: GraphicsQuality;
  stages?: { ao: boolean; bloom: boolean; dof: boolean; smaa: boolean };
  immediate?: boolean;
}) {
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
    if (immediate) showEffects(graph, true);
    const unwarm = warmupDraws(scene, () => dryRender(graph));
    let stopped = false;
    if (!immediate && graph.effects.length > 0) {
      void (async () => {
        await sceneRevealed(scene);
        if (stopped) return;
        // A link that throws leaves those programs to the effects' first frame, as before this wait.
        await linkDrawsOffFrame(gl, scene, () => dryRender(graph, true), () => stopped).catch(() => {});
        if (stopped) return;
        startRevealFade(graph);
        // On the performance timeline, so a load trace shows when the effects came in.
        if (typeof performance.mark === "function") performance.mark("jg:postfx:effects");
      })();
    }
    return () => {
      stopped = true;
      unwarm();
      disposeGraph(graph);
      releasePostfxOverlayTracking(scene);
      builtRef.current = null;
    };
  }, [gl, scene, camera, config, quality, stages, immediate]);

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
    if (built.grade !== null) requireUniform(built.grade.uniforms, "uTime").value += delta;
    measureComposerPasses(built.composer);
    built.composer.render(delta);
    advanceRevealFade(built, delta);
  }, 1);

  return null;
}
