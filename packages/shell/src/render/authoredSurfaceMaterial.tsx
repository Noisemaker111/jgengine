import { useLoader } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";

import type { ModelMaterialOverride } from "@jgengine/core/game/playableGame";

import { applyMaterialOverrideToMaterial, type MaterialOverrideTextures } from "../materialOverride";
import { modelMapEntries } from "./modelAssets";
import { useDisposable } from "./useDisposable";

/** Serializable PBR settings for an authored primitive surface. Map roles use the model-material contract. */
export interface AuthoredSurfaceConfig extends ModelMaterialOverride {
  /** Physical metres per texture tile on unit boxes/cylinders, including instance and parent scale. Omit to retain authored UVs. */
  repeatMetres?: number;
  /** Texture sampler policy on owned clones; defaults to repeat on both axes and anisotropy 1. */
  wrapping?: "repeat" | "clamp" | "mirror";
  anisotropy?: number;
  normalScale?: readonly [number, number];
  /** Normalized [0,1] height maps displace in local shape units (Three defaults: scale 1, bias 0). */
  displacementScale?: number;
  displacementBias?: number;
  transparent?: boolean;
  opacity?: number;
  depthWrite?: boolean;
}

/** Primitive UV layout whose physical dimensions drive `repeatMetres`. */
export type SurfaceShape = "box" | "cylinder";

/** Stable material identity, independent of object/map property insertion order. @internal */
export function authoredSurfaceKey(config: AuthoredSurfaceConfig): string {
  return JSON.stringify([
    config.color, config.metalness, config.roughness, config.emissive, config.emissiveIntensity,
    Object.entries(modelMapEntries(config.maps ?? {})), config.rim?.color, config.rim?.strength, config.rim?.power,
    config.repeatMetres, config.wrapping, config.anisotropy, config.normalScale, config.displacementScale, config.displacementBias, config.transparent, config.opacity, config.depthWrite,
  ]);
}

/** Configure owned map clones without changing textures retained in a loader cache. @internal */
export function authoredSurfaceTextures(entries: Record<string, string>, sources: readonly THREE.Texture[], config: AuthoredSurfaceConfig = {}): MaterialOverrideTextures {
  const wrapping = config.wrapping === "clamp" ? THREE.ClampToEdgeWrapping : config.wrapping === "mirror" ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
  return Object.fromEntries(Object.keys(entries).map((role, index) => {
    const texture = sources[index]!.clone();
    texture.colorSpace = role === "color" || role === "emissive" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = wrapping;
    texture.wrapT = wrapping;
    texture.anisotropy = config.anisotropy ?? 1;
    texture.needsUpdate = true;
    return [role, texture];
  }));
}

/** Apply PBR settings and optional metre UVs to an owned standard material. @internal */
export function configureAuthoredSurface(material: THREE.MeshStandardMaterial, config: AuthoredSurfaceConfig, textures: MaterialOverrideTextures, shape: SurfaceShape): void {
  const tile = config.repeatMetres;
  if (tile !== undefined && (!Number.isFinite(tile) || tile <= 0)) throw new Error("repeatMetres must be finite and positive");
  if (config.normalScale?.some(value => !Number.isFinite(value))) throw new Error("normalScale must be finite");
  if (config.anisotropy !== undefined && (!Number.isFinite(config.anisotropy) || config.anisotropy < 1)) throw new Error("anisotropy must be finite and >= 1");
  if ([config.displacementScale, config.displacementBias].some(value => value !== undefined && !Number.isFinite(value))) throw new Error("displacement settings must be finite");
  applyMaterialOverrideToMaterial(material, config, false, textures);
  if (config.displacementScale !== undefined) material.displacementScale = config.displacementScale;
  if (config.displacementBias !== undefined) material.displacementBias = config.displacementBias;
  if (config.transparent !== undefined) material.transparent = config.transparent;
  if (config.opacity !== undefined) material.opacity = config.opacity;
  if (config.depthWrite !== undefined) material.depthWrite = config.depthWrite;
  if (config.normalScale !== undefined) material.normalScale.set(...config.normalScale);
  if (tile === undefined) return;
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader.replace("#include <uv_vertex>", `#include <uv_vertex>
mat4 surfaceTransform = modelMatrix;
#ifdef USE_INSTANCING
 surfaceTransform = modelMatrix * instanceMatrix;
#endif
vec3 surfaceExtent = vec3(length(surfaceTransform[0].xyz), length(surfaceTransform[1].xyz), length(surfaceTransform[2].xyz));
vec2 surfaceRepeat = ${shape === "box"
      ? "abs(normal.x) > 0.5 ? surfaceExtent.zy : abs(normal.y) > 0.5 ? surfaceExtent.xz : surfaceExtent.xy"
      : "abs(normal.y) > 0.5 ? surfaceExtent.xz * 2.0 : vec2(6.28318530718 * sqrt((surfaceExtent.x * surfaceExtent.x + surfaceExtent.z * surfaceExtent.z) * 0.5), surfaceExtent.y)"};
surfaceRepeat /= ${tile.toExponential(8)};
${["MAP", "NORMALMAP", "ROUGHNESSMAP", "AOMAP", "METALNESSMAP", "EMISSIVEMAP", "DISPLACEMENTMAP"].map(role => {
      const name = { MAP: "vMapUv", NORMALMAP: "vNormalMapUv", ROUGHNESSMAP: "vRoughnessMapUv", AOMAP: "vAoMapUv", METALNESSMAP: "vMetalnessMapUv", EMISSIVEMAP: "vEmissiveMapUv", DISPLACEMENTMAP: "vDisplacementMapUv" }[role];
      return `#ifdef USE_${role}\n ${name} *= surfaceRepeat;\n#endif`;
    }).join("\n")}`);
  };
  material.customProgramCacheKey = () => `${previousKey}|authored-surface:${shape}:${tile}`;
}

/**
 * Load declared surface-map roles and own the material/map clones (cached textures remain untouched).
 * Colour/emissive maps are sRGB; normal, AO, roughness, metalness and height are linear. Cylinder side metres use the RMS ellipse circumference approximation.
 * Static batches and custom meshes share this lifecycle.
 * @capability authored-surface-material render declared PBR maps with colour-space handling and metre-scale box/cylinder UVs
 */
export function useAuthoredSurfaceMaterial(config: AuthoredSurfaceConfig, shape: SurfaceShape = "box"): THREE.MeshStandardMaterial {
  const key = authoredSurfaceKey(config);
  const entries = useMemo(() => modelMapEntries(config.maps ?? {}), [key]);
  const loaded = useLoader(THREE.TextureLoader, Object.values(entries));
  const resources = useDisposable(() => {
    const textures = authoredSurfaceTextures(entries, loaded, config);
    const material = new THREE.MeshStandardMaterial();
    try {
      configureAuthoredSurface(material, config, textures, shape);
    } catch (error) {
      material.dispose();
      Object.values(textures).forEach(texture => texture.dispose());
      throw error;
    }
    return [material, ...Object.values(textures)] as const;
  }, [key, entries, loaded, shape]);
  return resources[0];
}

/**
 * Mount an owned PBR surface material on a mesh.
 * @capability authored-surface-material mount an owned PBR surface material on a mesh
 */
export function AuthoredSurfaceMaterial({ surface, shape = "box" }: { surface: AuthoredSurfaceConfig; shape?: SurfaceShape }) {
  const material = useAuthoredSurfaceMaterial(surface, shape);
  return <primitive object={material} attach="material" />;
}
