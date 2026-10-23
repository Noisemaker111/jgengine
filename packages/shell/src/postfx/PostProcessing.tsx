import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer, RenderPass, UnrealBloomPass, type ShaderPass } from "three-stdlib";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";

import { DEFAULT_AO, type AoConfig, type PostProcessingConfig, type ToneMappingMode } from "@jgengine/core/render/postProcessing";
import { adaptExposure, DEFAULT_AUTO_EXPOSURE, exposureForKey, keyLuminanceFromSamples } from "@jgengine/core/render/colorPipeline";
import type { GraphicsQuality } from "@jgengine/core/settings/settingsModel";

import { ExposureMeterPass } from "./autoExposure";
import { createGradePass } from "./gradeShader";
import { releasePostfxOverlayTracking } from "./postfxOverlay";
import { StylizePass } from "./stylizePass";
import { renderShadowlessPrepass } from "./shadowPrepass";

/**
 * GTAO renders the scene with an `overrideMaterial` normal/depth prepass, which stamps
 * transparent overlay quads (additive VFX sprites, telegraphs, debug gizmos) into the AO
 * buffers as opaque squares — the AO composite then multiplies them toward black. Hide
 * marked overlay subtrees for the whole pass: the beauty buffer it composites over was
 * already rendered with them in.
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

interface BuiltGraph {
  composer: EffectComposer;
  grade: ShaderPass | null;
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

/**
 * Mounts an `EffectComposer` inside the shell Canvas and takes over rendering
 * (priority-1 `useFrame`, which disables R3F auto-render) to run the configured
 * post chain: RenderPass → GTAO → UnrealBloom → SMAA → exposure meter → OutputPass → Stylize → Grade. Rendered only
 * when `PlayableGame.postProcessing` is set, so games without it draw unchanged.
 *
 * `stages` (resolved from the player's graphics profile) controls expensive passes
 * independently. Medium keeps AO and DOF with reduced AO sampling; low can disable
 * them while retaining cheaper bloom, SMAA, tone mapping, and grade stages.
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
    const aa = config.aa === undefined ? "smaa" : config.aa;
    const msaaSamples = aa === false ? 0 : 2;
    const target = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      samples: msaaSamples,
    });
    const composer = new EffectComposer(gl, target);
    composer.addPass(new RenderPass(scene, camera));

    const resolvedStages = stages ?? { ao: quality === "high", bloom: true, dof: quality === "high", smaa: true };
    const aoStage = resolveAoStage(config.ao, resolvedStages.ao);
    if (aoStage !== null) {
      const ao = new OverlayAwareGTAOPass(scene, camera, width, height);
      ao.blendIntensity = aoStage.blend ?? 1;
      ao.updateGtaoMaterial({
        radius: aoStage.radius ?? 1.8,
        distanceExponent: 1,
        thickness: aoStage.distanceFalloff ?? 3.6,
        scale: aoStage.intensity ?? 2.4,
        samples: quality === "ultra" ? 16 : quality === "high" ? 12 : 8,
      });
      composer.addPass(ao);
    }

    if (resolvedStages.bloom && config.bloom !== false) {
      const b = config.bloom ?? {};
      composer.addPass(
        new UnrealBloomPass(
          new THREE.Vector2(width, height),
          b.strength ?? 0.32,
          b.radius ?? 0.55,
          b.threshold ?? 0.85,
        ),
      );
    }

    if (resolvedStages.dof && config.dof !== undefined && config.dof !== false) {
      const d = config.dof;
      const dof = new OverlayAwareBokehPass(scene, camera, {
        focus: d.focus ?? 18,
        aperture: d.aperture ?? (quality === "high" ? 0.00025 : 0.00012),
        maxblur: d.maxBlur ?? 0.01,
      });
      composer.addPass(dof);
    }

    // SMAA must run before OutputPass (linear-sRGB). Default on for post chains.
    if (resolvedStages.smaa && aa === "smaa") {
      composer.addPass(new SMAAPass());
    }

    // Clamped auto-exposure meters the pre-tone-map buffer, so the meter sits before OutputPass and
    // hands the adaptation to the renderer's exposure — the one value the sky swatches also read.
    const autoExposure = config.autoExposure === false ? null : { ...DEFAULT_AUTO_EXPOSURE, ...(config.autoExposure ?? {}) };
    const authoredExposure = config.exposure ?? 1;
    if (autoExposure !== null) {
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
    }

    composer.addPass(new OutputPass());

    if (config.stylize !== undefined && config.stylize !== false) {
      composer.addPass(new StylizePass(scene, camera, config.stylize));
    }

    let grade: ShaderPass | null = null;
    if (config.grade !== false) {
      grade = createGradePass(config.grade ?? {});
      composer.addPass(grade);
    }

    const graph: BuiltGraph = { composer, grade };
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
