import * as THREE from "three";
import { buildOceanWaveUniforms, type ResolvedOceanConfig } from "./OceanConfig";
import { oceanFragmentShader, oceanVertexShader } from "./OceanShader";

export interface OceanMaterialUniforms {
  uTime: { value: number };
  uWaveDirections: { value: THREE.Vector2[] };
  uWaveParams: { value: THREE.Vector4[] };
  uChoppiness: { value: number };
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
    },
  }) as OceanShaderMaterial;
  syncOceanMaterial(material, config, 0);
  return material;
}

export function syncOceanMaterial(
  material: OceanShaderMaterial,
  config: ResolvedOceanConfig,
  elapsedSeconds: number,
): void {
  const waveUniforms = buildOceanWaveUniforms(config);
  material.uniforms.uTime.value = elapsedSeconds;
  material.uniforms.uWaveDirections.value = waveUniforms.directions;
  material.uniforms.uWaveParams.value = waveUniforms.params;
  material.uniforms.uChoppiness.value = config.choppiness;
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
  material.transparent = config.color.opacity < 1;
  material.depthWrite = config.color.opacity >= 0.98;
}
