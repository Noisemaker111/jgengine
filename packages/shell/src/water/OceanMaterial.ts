import * as THREE from "three";
import { buildOceanWaveUniforms, type ResolvedOceanConfig } from "./OceanConfig";
import { oceanFragmentShader, oceanVertexShader } from "./OceanShader";

export interface OceanMaterialUniforms {
  uTime: { value: number };
  uWaveDirections: { value: THREE.Vector2[] };
  uWaveParams: { value: THREE.Vector4[] };
  uChoppiness: { value: number };
  uWaveCount: { value: number };
  uShallowColor: { value: THREE.Color };
  uDeepColor: { value: THREE.Color };
  uCrestColor: { value: THREE.Color };
  uFoamColor: { value: THREE.Color };
  uOpacity: { value: number };
  uFresnelStrength: { value: number };
  uHorizonBlend: { value: number };
  uFoamThreshold: { value: number };
  uFoamSoftness: { value: number };
  uFoamIntensity: { value: number };
  uFoamCoverage: { value: number };
  uDepthRange: { value: number };
  uShoreFoamWidth: { value: number };
  uSparkle: { value: number };
  uSunDirection: { value: THREE.Vector3 };
}

/** Matches the day-sky sun heading closely enough for stylized glints — not a lighting contract. */
const OCEAN_SUN_DIRECTION = new THREE.Vector3(0.45, 0.78, 0.35).normalize();

/** Glint strength by sun height: full once the sun clears the horizon, none once it has set. */
function sunGlintFactor(sunHeight: number): number {
  const t = Math.min(1, Math.max(0, (sunHeight + 0.02) / 0.17));
  return t * t * (3 - 2 * t);
}

export type OceanShaderMaterial = THREE.ShaderMaterial & { uniforms: OceanMaterialUniforms };

export function createOceanMaterial(config: ResolvedOceanConfig): OceanShaderMaterial {
  const material = new THREE.ShaderMaterial({
    vertexShader: oceanVertexShader,
    fragmentShader: oceanFragmentShader,
    side: THREE.DoubleSide,
    transparent: config.color.opacity < 1,
    depthWrite: config.color.opacity >= 0.98,
    uniforms: {
      uTime: { value: 0 },
      uWaveDirections: { value: [] },
      uWaveParams: { value: [] },
      uChoppiness: { value: config.choppiness },
      uWaveCount: { value: config.waves.length },
      uShallowColor: { value: new THREE.Color(config.color.shallow) },
      uDeepColor: { value: new THREE.Color(config.color.deep) },
      uCrestColor: { value: new THREE.Color(config.color.crest) },
      uFoamColor: { value: new THREE.Color(config.color.foam) },
      uOpacity: { value: config.color.opacity },
      uFresnelStrength: { value: config.color.fresnelStrength },
      uHorizonBlend: { value: config.color.horizonBlend },
      uFoamThreshold: { value: config.foam.crestThreshold },
      uFoamSoftness: { value: config.foam.softness },
      uFoamIntensity: { value: config.foam.intensity },
      uFoamCoverage: { value: config.foam.coverage },
      uDepthRange: { value: config.color.depthRange },
      uShoreFoamWidth: { value: config.foam.shoreWidth },
      uSparkle: { value: config.color.sparkle },
      uSunDirection: { value: OCEAN_SUN_DIRECTION.clone() },
    },
  }) as OceanShaderMaterial;
  syncOceanMaterial(material, config, 0);
  return material;
}

/**
 * Write the config and the frame's clock into the material. `sunDirection` is where the sky put the
 * sun: glints follow it, and fade out as it sets so a night sea does not sparkle. Without a sky the
 * fixed day heading is used.
 */
export function syncOceanMaterial(
  material: OceanShaderMaterial,
  config: ResolvedOceanConfig,
  elapsedSeconds: number,
  sunDirection?: readonly [number, number, number],
): void {
  const waveUniforms = buildOceanWaveUniforms(config);
  material.uniforms.uTime.value = elapsedSeconds;
  material.uniforms.uWaveDirections.value = waveUniforms.directions;
  material.uniforms.uWaveParams.value = waveUniforms.params;
  material.uniforms.uChoppiness.value = config.choppiness;
  material.uniforms.uWaveCount.value = config.waves.length;
  material.uniforms.uShallowColor.value.set(config.color.shallow);
  material.uniforms.uDeepColor.value.set(config.color.deep);
  material.uniforms.uCrestColor.value.set(config.color.crest);
  material.uniforms.uFoamColor.value.set(config.color.foam);
  material.uniforms.uOpacity.value = config.color.opacity;
  material.uniforms.uFresnelStrength.value = config.color.fresnelStrength;
  material.uniforms.uHorizonBlend.value = config.color.horizonBlend;
  material.uniforms.uFoamThreshold.value = config.foam.crestThreshold;
  material.uniforms.uFoamSoftness.value = config.foam.softness;
  material.uniforms.uFoamIntensity.value = config.foam.intensity;
  material.uniforms.uFoamCoverage.value = config.foam.coverage;
  material.uniforms.uDepthRange.value = config.color.depthRange;
  material.uniforms.uShoreFoamWidth.value = config.foam.shoreWidth;
  const sun = material.uniforms.uSunDirection.value;
  if (sunDirection === undefined) sun.copy(OCEAN_SUN_DIRECTION);
  else sun.set(sunDirection[0], sunDirection[1], sunDirection[2]).normalize();
  material.uniforms.uSparkle.value = config.color.sparkle * sunGlintFactor(sun.y);
  material.transparent = config.color.opacity < 1;
  material.depthWrite = config.color.opacity >= 0.98;
}
