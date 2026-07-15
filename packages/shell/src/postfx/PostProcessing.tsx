import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { EffectComposer, RenderPass, UnrealBloomPass, type ShaderPass } from "three-stdlib";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";

import type { PostProcessingConfig, ToneMappingMode } from "@jgengine/core/render/postProcessing";

import { createGradePass } from "./gradeShader";

const TONE_MAPPING: Record<ToneMappingMode, THREE.ToneMapping> = {
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  cineon: THREE.CineonToneMapping,
  linear: THREE.LinearToneMapping,
  none: THREE.NoToneMapping,
};

/**
 * Mounts an `EffectComposer` inside the shell Canvas and takes over rendering
 * (priority-1 `useFrame`, which disables R3F auto-render) to run the configured
 * post chain: RenderPass → GTAO → UnrealBloom → OutputPass → Grade. Rendered only
 * when `PlayableGame.postProcessing` is set, so games without it draw unchanged.
 */
export function PostProcessing({ config }: { config: PostProcessingConfig }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  const built = useMemo(() => {
    const width = Math.max(1, size.width);
    const height = Math.max(1, size.height);
    const target = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      samples: 2,
    });
    const composer = new EffectComposer(gl, target);
    composer.addPass(new RenderPass(scene, camera));

    if (config.ao !== undefined && config.ao !== false) {
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

    if (config.dof !== undefined && config.dof !== false) {
      const dof = config.dof;
      composer.addPass(
        new BokehPass(scene, camera, {
          focus: dof.focus ?? 18,
          aperture: dof.aperture ?? 0.00025,
          maxblur: dof.maxBlur ?? 0.01,
        }),
      );
    }

    composer.addPass(new OutputPass());

    let grade: ShaderPass | null = null;
    if (config.grade !== false) {
      grade = createGradePass(config.grade ?? {});
      composer.addPass(grade);
    }

    return { composer, grade };
  }, [gl, scene, camera, config, size.width, size.height]);

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
    const { composer } = built;
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
    return () => composer.dispose();
  }, [built, gl, size.width, size.height]);

  useFrame((_, delta) => {
    if (built.grade !== null) built.grade.uniforms.uTime.value += delta;
    built.composer.render(delta);
  }, 1);

  return null;
}
