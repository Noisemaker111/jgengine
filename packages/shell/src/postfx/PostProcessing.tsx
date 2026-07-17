import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer, RenderPass, UnrealBloomPass, type ShaderPass } from "three-stdlib";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";

import type { PostProcessingConfig, ToneMappingMode } from "@jgengine/core/render/postProcessing";
import type { GraphicsQuality } from "@jgengine/core/settings/settingsModel";

import { createGradePass } from "./gradeShader";

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
  dof: BokehPass | null;
}

function disposeGraph(built: BuiltGraph): void {
  for (const pass of built.composer.passes) pass.dispose();
  if (built.dof !== null) {
    built.dof.renderTargetDepth.dispose();
    built.dof.materialDepth.dispose();
    built.dof.materialBokeh.dispose();
    built.dof.fsQuad.dispose();
  }
  built.composer.dispose();
}

function syncSize(built: BuiltGraph, width: number, height: number, pixelRatio: number): void {
  built.composer.setPixelRatio(pixelRatio);
  built.composer.setSize(width, height);
  if (built.dof !== null) built.dof.renderTargetDepth.setSize(width * pixelRatio, height * pixelRatio);
}

/**
 * Mounts an `EffectComposer` inside the shell Canvas and takes over rendering
 * (priority-1 `useFrame`, which disables R3F auto-render) to run the configured
 * post chain: RenderPass → GTAO → UnrealBloom → OutputPass → Grade. Rendered only
 * when `PlayableGame.postProcessing` is set, so games without it draw unchanged.
 *
 * `quality` (the player's graphics-quality setting) gates the passes whose cost
 * scales with scene geometry or resolution beyond the dpr cap: GTAO re-renders
 * the whole scene for depth/normals and runs a multi-sample full-screen pass,
 * and Bokeh DOF renders scene depth again — both run on "high" only. Bloom,
 * tone mapping, and grade stay on every tier.
 */
export function PostProcessing({ config, quality = "high" }: { config: PostProcessingConfig; quality?: GraphicsQuality }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  const builtRef = useRef<BuiltGraph | null>(null);

  useEffect(() => {
    const width = Math.max(1, size.width);
    const height = Math.max(1, size.height);
    const target = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      samples: 2,
    });
    const composer = new EffectComposer(gl, target);
    composer.addPass(new RenderPass(scene, camera));

    const heavyPasses = quality === "high";
    if (heavyPasses && config.ao !== undefined && config.ao !== false) {
      const ao = new GTAOPass(scene, camera, width, height);
      ao.blendIntensity = config.ao.blend ?? 1;
      ao.updateGtaoMaterial({
        radius: config.ao.radius ?? 1.8,
        distanceExponent: 1,
        thickness: config.ao.distanceFalloff ?? 3.6,
        scale: config.ao.intensity ?? 2.4,
        samples: 16,
      });
      composer.addPass(ao);
    }

    if (config.bloom !== false) {
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

    let dof: BokehPass | null = null;
    if (heavyPasses && config.dof !== undefined && config.dof !== false) {
      const d = config.dof;
      dof = new BokehPass(scene, camera, {
        focus: d.focus ?? 18,
        aperture: d.aperture ?? 0.00025,
        maxblur: d.maxBlur ?? 0.01,
      });
      composer.addPass(dof);
    }

    composer.addPass(new OutputPass());

    let grade: ShaderPass | null = null;
    if (config.grade !== false) {
      grade = createGradePass(config.grade ?? {});
      composer.addPass(grade);
    }

    const graph: BuiltGraph = { composer, grade, dof };
    syncSize(graph, width, height, gl.getPixelRatio());
    builtRef.current = graph;
    return () => {
      disposeGraph(graph);
      builtRef.current = null;
    };
  }, [gl, scene, camera, config, quality]);

  useEffect(() => {
    const prevTone = gl.toneMapping;
    const prevExposure = gl.toneMappingExposure;
    gl.toneMapping = TONE_MAPPING[config.toneMapping ?? "aces"];
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
