import type { MaterialAsset } from "@jgengine/core/material/materialAsset";
import { useMemo } from "react";
import * as THREE from "three";

import { useMaterialAssetMaterial } from "./materialAsset";

/** Inputs for {@link applyTriplanarProjection}. */
export interface TriplanarProjectionOptions {
  /** Metres one texture tile covers in world space. Must be finite and positive. */
  tileMetres: number;
  /** Blend sharpness between the three projections; 4 keeps corners soft, 8 is decisive. */
  sharpness?: number;
  /** Normal strength applied to each projection's tangent-space perturbation. */
  normalScale?: number;
}

const VERTEX_PARS = `varying vec3 vJgTriPos;
varying vec3 vJgTriNormal;`;

const VERTEX_WORLD_NORMAL = `vJgTriNormal = normalize(mat3(modelMatrix) * objectNormal);`;

const VERTEX_WORLD_POSITION = `vec4 jgTriWorld = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
jgTriWorld = instanceMatrix * jgTriWorld;
#endif
vJgTriPos = (modelMatrix * jgTriWorld).xyz;`;

const FRAGMENT_PARS = `varying vec3 vJgTriPos;
varying vec3 vJgTriNormal;
uniform float uJgTriTile;
uniform float uJgTriSharp;
uniform float uJgTriNormalScale;
vec3 jgTriWeights() {
  vec3 w = pow(abs(normalize(vJgTriNormal)), vec3(uJgTriSharp));
  return w / max(dot(w, vec3(1.0)), 1e-4);
}
vec3 jgTriSample(sampler2D tex, vec3 w) {
  vec3 p = vJgTriPos / uJgTriTile;
  return texture2D(tex, p.zy).rgb * w.x + texture2D(tex, p.xz).rgb * w.y + texture2D(tex, p.xy).rgb * w.z;
}`;

const FRAGMENT_COLOR = `#ifdef USE_MAP
{
  vec3 jgW = jgTriWeights();
  vec3 jgP = vJgTriPos / uJgTriTile;
  diffuseColor *= texture2D(map, jgP.zy) * jgW.x + texture2D(map, jgP.xz) * jgW.y + texture2D(map, jgP.xy) * jgW.z;
}
#endif`;

const FRAGMENT_ROUGHNESS = `float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
roughnessFactor *= jgTriSample(roughnessMap, jgTriWeights()).g;
#endif`;

// Each projection perturbs the world normal along its own tangent frame: an X-facing projection
// uses +Z as U and +Y as V, a Y-facing one +X/+Z, a Z-facing one +X/+Y.
const FRAGMENT_NORMAL = `#ifdef USE_NORMALMAP
{
  vec3 jgW = jgTriWeights();
  vec3 jgP = vJgTriPos / uJgTriTile;
  vec3 jgNx = texture2D(normalMap, jgP.zy).xyz * 2.0 - 1.0;
  vec3 jgNy = texture2D(normalMap, jgP.xz).xyz * 2.0 - 1.0;
  vec3 jgNz = texture2D(normalMap, jgP.xy).xyz * 2.0 - 1.0;
  jgNx.xy *= uJgTriNormalScale;
  jgNy.xy *= uJgTriNormalScale;
  jgNz.xy *= uJgTriNormalScale;
  vec3 jgPerturb = vec3(jgNx.z, jgNx.y, jgNx.x) * jgW.x
    + vec3(jgNy.x, jgNy.z, jgNy.y) * jgW.y
    + vec3(jgNz.x, jgNz.y, jgNz.z) * jgW.z;
  normal = normalize((viewMatrix * vec4(normalize(vJgTriNormal + jgPerturb), 0.0)).xyz);
}
#endif`;

const FRAGMENT_AO = `#ifdef USE_AOMAP
{
  float jgAo = jgTriSample(aoMap, jgTriWeights()).r;
  float ambientOcclusion = ( jgAo - 1.0 ) * aoMapIntensity + 1.0;
  reflectedLight.indirectDiffuse *= ambientOcclusion;
  #if defined( USE_CLEARCOAT )
    clearcoatSpecularIndirect *= ambientOcclusion;
  #endif
  #if defined( USE_SHEEN )
    sheenSpecularIndirect *= ambientOcclusion;
  #endif
  #if defined( USE_ENVMAP ) && defined( STANDARD )
    float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
    reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
  #endif
}
#endif`;

/**
 * The GLSL the triplanar path injects, split by chunk. Exposed so a test can prove the patch
 * samples by world position instead of `vMapUv`, and so a reader can audit the projection.
 * @internal
 */
export function triplanarChunks(): {
  vertexPars: string;
  vertexNormal: string;
  vertexPosition: string;
  fragmentPars: string;
  color: string;
  roughness: string;
  normal: string;
  ao: string;
} {
  return {
    vertexPars: VERTEX_PARS,
    vertexNormal: VERTEX_WORLD_NORMAL,
    vertexPosition: VERTEX_WORLD_POSITION,
    fragmentPars: FRAGMENT_PARS,
    color: FRAGMENT_COLOR,
    roughness: FRAGMENT_ROUGHNESS,
    normal: FRAGMENT_NORMAL,
    ao: FRAGMENT_AO,
  };
}

function assertPatchable(material: THREE.MeshStandardMaterial): void {
  const vertex = THREE.ShaderLib.physical.vertexShader;
  const fragment = THREE.ShaderLib.physical.fragmentShader;
  const required = [
    [vertex, "#include <beginnormal_vertex>"],
    [vertex, "#include <worldpos_vertex>"],
    [fragment, "#include <map_fragment>"],
    [fragment, "#include <roughnessmap_fragment>"],
    [fragment, "#include <normal_fragment_maps>"],
    [fragment, "#include <aomap_fragment>"],
  ] as const;
  for (const [source, marker] of required) {
    if (!source.includes(marker)) throw new Error(`Three.js r${THREE.REVISION} physical shader lacks ${marker} for the triplanar world projection`);
  }
  if (!(material as THREE.MeshStandardMaterial).isMeshStandardMaterial) throw new Error("Triplanar projection requires a standard or physical material");
}

/**
 * Projects a standard material's maps from world position instead of mesh UVs, so world geometry
 * without a `uv` attribute still renders a textured PBR surface. Instanced meshes project in their
 * instanced world space. Skinned meshes keep the bind-pose normal for the blend weights, which is
 * close enough for the static world surfaces this path exists for.
 */
export function applyTriplanarProjection(
  material: THREE.MeshStandardMaterial,
  options: TriplanarProjectionOptions,
): THREE.MeshStandardMaterial {
  const tile = options.tileMetres;
  if (!Number.isFinite(tile) || tile <= 0) throw new Error("Triplanar tileMetres must be finite and positive");
  const sharpness = options.sharpness ?? 8;
  const normalScale = options.normalScale ?? 1;
  if (!Number.isFinite(sharpness) || sharpness <= 0) throw new Error("Triplanar sharpness must be finite and positive");
  if (!Number.isFinite(normalScale) || normalScale < 0) throw new Error("Triplanar normalScale must be finite and non-negative");
  if (material.userData["jgTriplanar"] !== undefined) return material;
  assertPatchable(material);

  const uniforms = {
    uJgTriTile: { value: tile },
    uJgTriSharp: { value: sharpness },
    uJgTriNormalScale: { value: normalScale },
  };
  material.userData["jgTriplanar"] = uniforms;

  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_PARS}`)
      .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>\n${VERTEX_WORLD_NORMAL}`)
      .replace("#include <worldpos_vertex>", `#include <worldpos_vertex>\n${VERTEX_WORLD_POSITION}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAGMENT_PARS}`)
      .replace("#include <map_fragment>", FRAGMENT_COLOR)
      .replace("#include <roughnessmap_fragment>", FRAGMENT_ROUGHNESS)
      .replace("#include <normal_fragment_maps>", FRAGMENT_NORMAL)
      .replace("#include <aomap_fragment>", FRAGMENT_AO);
  };
  material.customProgramCacheKey = () => `${previousKey.call(material)}|jg-triplanar:v1`;
  material.needsUpdate = true;
  return material;
}

/**
 * Render a serializable material asset — one built by `libraryMaterialAsset`, or authored in the
 * editor — with world-space triplanar projection, so world geometry needs no UVs. Tile size
 * defaults to the asset's own `physicalSize`, which the shared library sets per surface.
 * @capability material-triplanar render a material asset on world geometry without UVs
 */
export function useTriplanarAssetMaterial(
  asset: MaterialAsset,
  options: { tileMetres?: number; sharpness?: number; normalScale?: number } = {},
): THREE.MeshStandardMaterial {
  const material = useMaterialAssetMaterial(asset);
  const tile = options.tileMetres ?? asset.textures?.color?.physicalSize?.[0] ?? asset.textures?.normal?.physicalSize?.[0] ?? 1;
  const sharpness = options.sharpness ?? 8;
  const normalScale = options.normalScale ?? 1;
  return useMemo(
    () => applyTriplanarProjection(material, { tileMetres: tile, sharpness, normalScale }),
    [material, tile, sharpness, normalScale],
  );
}

/** Mounts {@link useTriplanarAssetMaterial} on a mesh; the R3F renderer owns disposal. */
export function TriplanarAssetMaterial({ asset, ...options }: { asset: MaterialAsset } & { tileMetres?: number; sharpness?: number; normalScale?: number }) {
  const material = useTriplanarAssetMaterial(asset, options);
  return <primitive object={material} attach="material" />;
}
