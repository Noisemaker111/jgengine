import * as THREE from "three";

import type { SkyLight } from "@jgengine/core/sky/skyLight.draw";
import { createSkyLight } from "@jgengine/core/sky/skyLight.draw";

import { buildOceanWaveUniforms, type ResolvedOceanConfig } from "./OceanConfig.draw";
import { oceanFragmentShader, oceanVertexShader } from "./OceanShader";

/** Uniforms the ocean shader reads: time, wave set, bed map, colours, foam, and the sky's light. */
export interface OceanMaterialUniforms {
  uTime: { value: number };
  uWaveDirections: { value: THREE.Vector2[] };
  uWaveParams: { value: THREE.Vector4[] };
  uWavePhases: { value: number[] };
  uChoppiness: { value: number };
  uWaveCount: { value: number };
  uBedMap: { value: THREE.Texture };
  /** Bed-map rect in ocean-local XZ: min x, min z, width, depth. */
  uBedRect: { value: THREE.Vector4 };
  /** World height of the still surface. */
  uSurfaceY: { value: number };
  /** World XZ the waves and the bed are measured from. */
  uOrigin: { value: THREE.Vector2 };
  /** World XZ offset of a camera-following sheet. */
  uFollow: { value: THREE.Vector2 };
  uBorderFade: { value: number };
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
  uClarity: { value: number };
  uShoreFoamWidth: { value: number };
  uShoreWaves: { value: number };
  uSparkle: { value: number };
  uSunDirection: { value: THREE.Vector3 };
  uSun: { value: THREE.Color };
  uMoonDirection: { value: THREE.Vector3 };
  uMoon: { value: THREE.Color };
  uAmbient: { value: THREE.Color };
  uZenith: { value: THREE.Color };
  uHorizon: { value: THREE.Color };
  uCover: { value: number };
}

/** Glint strength by sun height: full once the sun clears the horizon, none once it has set. */
function sunGlintFactor(sunHeight: number): number {
  const t = Math.min(1, Math.max(0, (sunHeight + 0.02) / 0.17));
  return t * t * (3 - 2 * t);
}

/** The ocean's `ShaderMaterial`, typed with its {@link OceanMaterialUniforms}. */
export type OceanShaderMaterial = THREE.ShaderMaterial & { uniforms: OceanMaterialUniforms };

const DAY_LIGHT = createSkyLight();

let deepBed: THREE.DataTexture | null = null;

/** A one-texel bed far below the surface: open sea with no shore. @internal */
export function deepBedTexture(): THREE.DataTexture {
  if (deepBed !== null) return deepBed;
  const texture = new THREE.DataTexture(new Uint16Array([THREE.DataUtils.toHalfFloat(-1000)]), 1, 1, THREE.RedFormat, THREE.HalfFloatType);
  texture.needsUpdate = true;
  deepBed = texture;
  return texture;
}

/** Build the ocean shader material for a resolved config. */
export function createOceanMaterial(config: ResolvedOceanConfig): OceanShaderMaterial {
  const material = new THREE.ShaderMaterial({
    vertexShader: oceanVertexShader,
    fragmentShader: oceanFragmentShader,
    side: THREE.DoubleSide,
    transparent: true,
    // The surface still writes depth: post passes read it (shafts treat a depth-less sea as open sky)
    // and nothing behind the water should draw over it. The bed is opaque and already drawn.
    depthWrite: true,
    fog: true,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uTime: { value: 0 },
      uWaveDirections: { value: [] },
      uWaveParams: { value: [] },
      uWavePhases: { value: [] },
      uChoppiness: { value: config.choppiness },
      uWaveCount: { value: config.waves.length },
      uBedMap: { value: deepBedTexture() },
      uBedRect: { value: new THREE.Vector4(-1, -1, 2, 2) },
      uSurfaceY: { value: 0 },
      uOrigin: { value: new THREE.Vector2() },
      uFollow: { value: new THREE.Vector2() },
      uBorderFade: { value: config.follow ? 0 : 1 },
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
      uClarity: { value: config.color.clarity },
      uShoreFoamWidth: { value: config.foam.shoreWidth },
      uShoreWaves: { value: config.foam.shoreWaves },
      uSparkle: { value: config.color.sparkle },
      uSunDirection: { value: DAY_LIGHT.sunDirection.clone() },
      uSun: { value: DAY_LIGHT.sun.clone() },
      uMoonDirection: { value: DAY_LIGHT.moonDirection.clone() },
      uMoon: { value: DAY_LIGHT.moon.clone() },
      uAmbient: { value: DAY_LIGHT.ambient.clone() },
      uZenith: { value: DAY_LIGHT.zenith.clone() },
      uHorizon: { value: DAY_LIGHT.horizon.clone() },
      uCover: { value: 0 },
    },
  }) as OceanShaderMaterial;
  syncOceanMaterial(material, config, 0);
  return material;
}

/**
 * Write the config, the frame's clock and the sky's light into the material. `light` is what the
 * scene's sky published (`readSkyLight`): the water is lit, tinted and reflects by it, and its glints
 * fade as the sun sets. Without a sky it keeps a clear noon.
 */
export function syncOceanMaterial(material: OceanShaderMaterial, config: ResolvedOceanConfig, elapsedSeconds: number, light?: SkyLight): void {
  const u = material.uniforms;
  u.uTime.value = elapsedSeconds;
  if (material.userData["waveConfig"] !== config) {
    const waveUniforms = buildOceanWaveUniforms(config);
    u.uWaveDirections.value = waveUniforms.directions;
    u.uWaveParams.value = waveUniforms.params;
    u.uWavePhases.value = waveUniforms.phases;
    material.userData["waveConfig"] = config;
  }
  u.uChoppiness.value = config.choppiness;
  u.uWaveCount.value = config.waves.length;
  u.uShallowColor.value.set(config.color.shallow);
  u.uDeepColor.value.set(config.color.deep);
  u.uCrestColor.value.set(config.color.crest);
  u.uFoamColor.value.set(config.color.foam);
  u.uOpacity.value = config.color.opacity;
  u.uFresnelStrength.value = config.color.fresnelStrength;
  u.uHorizonBlend.value = config.color.horizonBlend;
  u.uFoamThreshold.value = config.foam.crestThreshold;
  u.uFoamSoftness.value = config.foam.softness;
  u.uFoamIntensity.value = config.foam.intensity;
  u.uFoamCoverage.value = config.foam.coverage;
  u.uDepthRange.value = config.color.depthRange;
  u.uClarity.value = config.color.clarity;
  u.uShoreFoamWidth.value = config.foam.shoreWidth;
  u.uShoreWaves.value = config.foam.shoreWaves;
  u.uBorderFade.value = config.follow ? 0 : 1;
  const sky = light ?? DAY_LIGHT;
  u.uSunDirection.value.copy(sky.sunDirection);
  u.uSun.value.copy(sky.sun);
  u.uMoonDirection.value.copy(sky.moonDirection);
  u.uMoon.value.copy(sky.moon);
  u.uAmbient.value.copy(sky.ambient);
  u.uZenith.value.copy(sky.zenith);
  u.uHorizon.value.copy(sky.horizon);
  u.uCover.value = sky.cloudCover;
  u.uSparkle.value = config.color.sparkle * sunGlintFactor(sky.sunDirection.y);
}
