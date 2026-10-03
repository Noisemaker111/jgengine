import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { useLoader, useThree } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";

import { MATERIAL_TEXTURE_SEMANTICS, validateMaterialAsset, type MaterialAsset, type MaterialAssignment, type MaterialSurfaceParameters, type MaterialTextureMetadata, type MaterialTextureRole } from "@jgengine/core/material/materialAsset";

import { applyMaterialOverrideToMaterial, MATERIAL_TEXTURE_PROPERTIES, requiresPhysicalMaterial, type MaterialOverrideTextures } from "../materialOverride";
import { configureAuthoredSurface, type SurfaceShape } from "./authoredSurfaceMaterial";
import { ownModelMaterial } from "./modelRender";
import { useDisposable } from "./useDisposable";
import { detectKtx2Support, materialKtx2Loader } from "./modelLoad";
import { resolveAssetBaseUrl } from "./assetBase";

/** Shares the model transcoder and loader cache while loading native authored images normally. @internal */
export class MaterialTextureLoader extends THREE.Loader<THREE.Texture> {
  override load(url: string, onLoad?: (texture: THREE.Texture) => void, onProgress?: (event: ProgressEvent) => void, onError?: (error: unknown) => void): void {
    const resolved = resolveAssetBaseUrl(url);
    if (/\.ktx2(?:[?#]|$)/i.test(url)) return materialKtx2Loader().load(resolved, texture => onLoad?.(texture), onProgress, onError);
    new THREE.TextureLoader(this.manager).load(resolved, onLoad, onProgress, onError);
  }
}

const wrapping = { repeat: THREE.RepeatWrapping, clamp: THREE.ClampToEdgeWrapping, mirror: THREE.MirroredRepeatWrapping };
const filters = { nearest: THREE.NearestFilter, linear: THREE.LinearFilter, "nearest-mipmap-nearest": THREE.NearestMipmapNearestFilter, "nearest-mipmap-linear": THREE.NearestMipmapLinearFilter, "linear-mipmap-nearest": THREE.LinearMipmapNearestFilter, "linear-mipmap-linear": THREE.LinearMipmapLinearFilter };

/**
 * Validate and configure an owned texture view while retaining the loader's immutable source.
 * @capability material-texture-metadata configure owned map views with semantic color space, packed channels, UV transforms and sampling
 */
export function configureMaterialTexture(role: MaterialTextureRole, metadata: MaterialTextureMetadata, source: THREE.Texture): THREE.Texture {
  const expected = MATERIAL_TEXTURE_SEMANTICS[role].channel;
  if (metadata.channel !== undefined && metadata.channel !== expected && !(role === "color" && metadata.channel === "rgb")) throw new Error(`Texture ${role} requires ${expected} channels in Three.js; repack ${metadata.url}`);
  if (metadata.compression !== undefined && (metadata.compression === "ktx2" || metadata.compression === "basisu") && !(source as THREE.CompressedTexture).isCompressedTexture) throw new Error(`Compressed texture ${metadata.url} requires the KTX2 loader; embed it in glTF or use an uncompressed authored map`);
  const color = ["color", "emissive", "sheenColor", "specularColor"].includes(role);
  if (metadata.colorSpace !== (color ? "srgb" : "linear")) throw new Error(`Texture ${role} requires ${color ? "srgb" : "linear"} color space`);
  const texture = source.clone();
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.channel = metadata.uvSet ?? 0;
  if (metadata.transform !== undefined) {
    texture.offset.set(...metadata.transform.offset ?? [0, 0]);
    texture.repeat.set(...metadata.transform.scale ?? [1, 1]);
    texture.rotation = metadata.transform.rotation ?? 0;
  }
  if (metadata.sampler?.wrapS !== undefined) texture.wrapS = wrapping[metadata.sampler.wrapS];
  if (metadata.sampler?.wrapT !== undefined) texture.wrapT = wrapping[metadata.sampler.wrapT];
  if (metadata.sampler?.minFilter !== undefined) texture.minFilter = filters[metadata.sampler.minFilter];
  if (metadata.sampler?.magFilter !== undefined) texture.magFilter = filters[metadata.sampler.magFilter];
  texture.anisotropy = metadata.sampler?.anisotropy ?? 1;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Physical defaults adapt a declared construction; explicit authored parameters remain authoritative.
 * @capability material-assets resolve fabric and hair construction into sparse physical appearance parameters
 */
export function materialAssetSurface(asset: MaterialAsset, overrides: MaterialSurfaceParameters = {}): MaterialSurfaceParameters {
  const errors = validateMaterialAsset(asset).filter(diagnostic => diagnostic.severity === "error");
  if (errors.length > 0) throw new Error(`Material ${asset.id}: ${errors.map(error => `${error.path}: ${error.message}`).join("; ")}`);
  const fabric = asset.fabric;
  const hair = asset.hair;
  return {
    ...(fabric?.construction === "fuzzy" ? { sheen: 1, sheenColor: asset.surface.color ?? "#ffffff", sheenRoughness: 0.8 } : {}),
    ...(fabric?.construction === "woven" ? { anisotropy: 0.65, anisotropyRotation: fabric.weaveDirection ?? 0 } : {}),
    ...(hair !== undefined ? { anisotropy: 0.8, anisotropyRotation: hair.strandDirection ?? Math.PI / 2, ...(hair.geometry === "cards" ? { alphaMode: "mask" as const, alphaCutoff: 0.5, doubleSided: true } : {}) } : {}),
    ...asset.surface,
    ...overrides,
  };
}

const materialAssetBases = new WeakMap<THREE.Material, THREE.Material>();

function applyNormalConventions(material: THREE.MeshStandardMaterial, asset: MaterialAsset): void {
  if (asset.textures?.normal?.normalConvention === "directx") material.normalScale.y *= -1;
  if (asset.textures?.clearcoatNormal?.normalConvention === "directx") (material as THREE.MeshPhysicalMaterial).clearcoatNormalScale.y *= -1;
}

function applyFabric(material: THREE.MeshStandardMaterial, asset: MaterialAsset): void {
  const fabric = asset.fabric;
  if (fabric?.construction !== "woven") return;
  const direction = fabric.weaveDirection ?? 0;
  const scale = fabric.threadScale ?? 80;
  const strength = fabric.normalStrength ?? 0.12;
  const variation = fabric.variation ?? 0.05;
  if (![direction, scale, strength, variation].every(Number.isFinite) || scale <= 0) throw new Error(`Fabric ${asset.id} requires finite weave settings and positive threadScale`);
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    shader.uniforms.uJgFabric = { value: new THREE.Vector4(scale, strength, variation, direction) };
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vJgFabricUv;").replace("#include <uv_vertex>", "#include <uv_vertex>\nvJgFabricUv = uv;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec2 vJgFabricUv;\nuniform vec4 uJgFabric;")
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
float jgCos = cos(uJgFabric.w), jgSin = sin(uJgFabric.w);
mat2 jgRotation = mat2(jgCos, -jgSin, jgSin, jgCos);
vec2 jgThreads = jgRotation * vJgFabricUv * uJgFabric.x * 6.28318530718;
vec2 jgThreadFilter = 1.0 - smoothstep(vec2(1.0), vec2(3.14159265359), fwidth(jgThreads));
roughnessFactor = clamp(roughnessFactor + sin(jgThreads.x) * sin(jgThreads.y) * jgThreadFilter.x * jgThreadFilter.y * uJgFabric.z, 0.04, 1.0);`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
vec3 jgDx = dFdx(-vViewPosition), jgDy = dFdy(-vViewPosition);
vec2 jgUvDx = dFdx(vJgFabricUv), jgUvDy = dFdy(vJgFabricUv);
vec3 jgT = jgDx * jgUvDy.y - jgDy * jgUvDx.y;
vec3 jgB = -jgDx * jgUvDy.x + jgDy * jgUvDx.x;
float jgFrameLength = max(max(length(jgT), length(jgB)), 0.000001);
vec2 jgSlope = transpose(jgRotation) * (cos(jgThreads) * jgThreadFilter * uJgFabric.y);
normal = normalize(normal + (jgT * jgSlope.x + jgB * jgSlope.y) / jgFrameLength);`);
  };
  material.customProgramCacheKey = () => `${previousKey}|jg-fabric:v1`;
  material.needsUpdate = true;
}

function applyHair(material: THREE.MeshStandardMaterial, asset: MaterialAsset): void {
  const hair = asset.hair;
  if (hair?.geometry !== "cards") return;
  const strength = hair.backlightStrength ?? 0.25;
  if (strength === 0) return;
  const tint = new THREE.Color(hair.backlightColor ?? asset.surface.color ?? "#ffffff");
  material.userData.jgHairBacklightStrength = strength;
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = function (this: THREE.MeshStandardMaterial, shader, renderer) {
    previousCompile.call(this, shader, renderer);
    const uniform = { value: strength * ((this.userData.jgHairLightExposure as number | undefined) ?? 1) };
    this.userData.jgHairBacklightUniform = uniform;
    shader.uniforms.uJgHairBacklight = uniform;
    shader.uniforms.uJgHairTint = { value: tint };
    const directDiffuse = "reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );";
    const chunk = THREE.ShaderChunk.lights_physical_pars_fragment;
    if (!chunk.includes(directDiffuse)) throw new Error("Pinned physical shader no longer supports the hair-card backlight adapter");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uJgHairBacklight;\nuniform vec3 uJgHairTint;")
      .replace("#include <lights_physical_pars_fragment>", chunk.replace(directDiffuse, `${directDiffuse}
float jgHairBack = saturate(-dot(geometryNormal, directLight.direction));
float jgHairForward = pow(saturate(dot(-directLight.direction, geometryViewDir)), 4.0);
reflectedLight.directDiffuse += directLight.color * uJgHairTint * (jgHairBack * mix(0.25, 1.0, jgHairForward) * uJgHairBacklight * RECIPROCAL_PI);`));
  };
  material.customProgramCacheKey = () => `${previousKey}|jg-hair-cards:v1`;
  material.needsUpdate = true;
}

/**
 * Apply one reusable material's parameters, map views and construction to an imported PBR slot.
 * @capability material-assets clone and configure an imported PBR slot while retaining its omitted physical features and maps
 */
export function applyMaterialAsset(material: THREE.Material, asset: MaterialAsset, textures?: MaterialOverrideTextures, overrides?: MaterialSurfaceParameters): THREE.MeshStandardMaterial {
  if (!(material as THREE.MeshStandardMaterial).isMeshStandardMaterial) throw new Error(`Material ${asset.id} requires an imported standard or physical PBR slot`);
  const source = materialAssetBases.get(material) ?? material;
  const surface = materialAssetSurface(asset, overrides);
  if ((surface.transmission ?? 0) > 0 && surface.alphaMode === undefined && source.transparent) throw new Error(`Material ${asset.id} transmission requires an explicit opaque or mask alphaMode on the imported blended slot`);
  const target = applyMaterialOverrideToMaterial(source, surface, true, textures) as THREE.MeshStandardMaterial;
  materialAssetBases.set(target, source);
  applyNormalConventions(target, asset);
  applyFabric(target, asset);
  applyHair(target, asset);
  target.userData = { ...target.userData, jgMaterialAsset: asset.id };
  return target;
}

/**
 * Apply intersecting mesh/slot selectors without changing omitted imported slots. Returns caller-owned replacements; model clones register them for cleanup.
 * @capability material-assets assign reusable physical assets to independent imported model slots
 */
export function applyMaterialAssignments(root: THREE.Object3D, assets: readonly MaterialAsset[], assignments: readonly MaterialAssignment[], textures: ReadonlyMap<string, MaterialOverrideTextures> = new Map()): THREE.Material[] {
  const byId = new Map(assets.map(asset => [asset.id, asset]));
  const matches = assignments.map(assignment => {
    const asset = byId.get(assignment.materialId);
    if (asset === undefined) throw new Error(`Unknown material asset ${assignment.materialId}`);
    const selected: { mesh: THREE.Mesh; index: number }[] = [];
    root.traverse(node => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh || (assignment.selector.mesh !== undefined && mesh.name !== assignment.selector.mesh)) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material, index) => {
        if (assignment.selector.slot !== undefined && material.name !== assignment.selector.slot) return;
        if (assignment.selector.slotIndex !== undefined && index !== assignment.selector.slotIndex) return;
        if (!(material as THREE.MeshStandardMaterial).isMeshStandardMaterial) throw new Error(`Slot ${mesh.name}/${index} is not a supported PBR material`);
        if ((asset.fabric?.construction === "woven" || asset.hair !== undefined || (materialAssetSurface(asset, assignment.overrides).anisotropy ?? 0) > 0) && (mesh.geometry.getAttribute("uv") === undefined || mesh.geometry.getAttribute("normal") === undefined)) throw new Error(`Directional material ${asset.id} requires mesh UVs and normals`);
        for (const [role, metadata] of Object.entries(asset.textures ?? {})) {
          const uv = metadata!.uvSet ?? 0;
          if (mesh.geometry.getAttribute(uv === 0 ? "uv" : `uv${uv}`) === undefined) throw new Error(`Texture ${role} on ${mesh.name} requires UV set ${uv}`);
        }
        selected.push({ mesh, index });
      });
    });
    if (selected.length === 0) throw new Error(`Material selector ${JSON.stringify(assignment.selector)} matched no slots`);
    return { assignment, asset, selected };
  });
  const final = new Map<THREE.Mesh, Map<number, { assignment: MaterialAssignment; asset: MaterialAsset }>>();
  for (const { assignment, asset, selected } of matches) for (const { mesh, index } of selected) {
    let slots = final.get(mesh);
    if (slots === undefined) { slots = new Map(); final.set(mesh, slots); }
    slots.set(index, { assignment, asset });
  }
  const owned: THREE.Material[] = [];
  const originals: { mesh: THREE.Mesh; index: number; source: THREE.Material }[] = [];
  try {
    for (const [mesh, slots] of final) for (const [index, { assignment, asset }] of slots) {
      const source = Array.isArray(mesh.material) ? mesh.material[index]! : mesh.material;
      const target = applyMaterialAsset(source, asset, textures.get(asset.id), assignment.overrides);
      originals.push({ mesh, index, source });
      owned.push(target);
      ownModelMaterial(root, target);
      if (Array.isArray(mesh.material)) mesh.material[index] = target;
      else mesh.material = target;
    }
    return owned;
  } catch (error) {
    for (const { mesh, index, source } of originals) {
      if (Array.isArray(mesh.material)) mesh.material[index] = source;
      else mesh.material = source;
    }
    for (const material of owned) material.dispose();
    throw error;
  }
}

/** Reusable primitive surface options; physical metre UVs reuse the instanced surface renderer. */
export interface MaterialAssetSurfaceOptions { shape?: SurfaceShape; repeatMetres?: number; overrides?: MaterialSurfaceParameters }

/**
 * Load map views, own their cleanup and build the same physical shader used by model assignments.
 * @capability material-assets own a serializable material asset's textures and runtime physical shader for a custom renderer
 */
export function useMaterialAssetMaterial(asset: MaterialAsset, options: MaterialAssetSurfaceOptions = {}): THREE.MeshStandardMaterial {
  const key = JSON.stringify([asset, options]);
  const entries = useMemo(() => Object.entries(asset.textures ?? {}) as [MaterialTextureRole, MaterialTextureMetadata][], [key]);
  const renderer = useThree(state => state.gl);
  if (entries.some(([, metadata]) => /\.ktx2(?:[?#]|$)/i.test(metadata.url))) detectKtx2Support(renderer);
  const loaded = useLoader(MaterialTextureLoader, entries.map(([, metadata]) => metadata.url));
  const resources = useDisposable(() => {
    const textures: MaterialOverrideTextures = {};
    let material: THREE.MeshStandardMaterial | undefined;
    try {
      entries.forEach(([role, metadata], index) => { textures[role] = configureMaterialTexture(role, metadata, loaded[index]!); });
      const surface = materialAssetSurface(asset, options.overrides);
      material = requiresPhysicalMaterial(surface, textures) ? new THREE.MeshPhysicalMaterial() : new THREE.MeshStandardMaterial();
      configureAuthoredSurface(material, { ...surface, anisotropy: undefined, surfaceAnisotropy: surface.anisotropy, repeatMetres: options.repeatMetres }, textures, options.shape ?? "box");
      applyNormalConventions(material, asset);
      applyFabric(material, asset);
      applyHair(material, asset);
      material.userData.jgMaterialAsset = asset.id;
      return [material, ...Object.values(textures)] as const;
    } catch (error) {
      material?.dispose();
      Object.values(textures).forEach(texture => texture.dispose());
      throw error;
    }
  }, [key, loaded]);
  return resources[0];
}

/**
 * Mount a serializable material asset on an authored primitive, sharing model-slot rendering and owned resource cleanup.
 * @capability material-assets render authored physical surfaces, woven detail and approximate hair-card appearance
 */
export function MaterialAssetSurface({ asset, ...options }: { asset: MaterialAsset } & MaterialAssetSurfaceOptions) {
  const material = useMaterialAssetMaterial(asset, options);
  return <primitive object={material} attach="material" />;
}

/**
 * Estimate texture allocation from loaded dimensions/mips and report pass/coverage risks. Compressed maps count actual mip bytes; uncompressed bytes bound texture views that may share uploads. This does not measure pixel overdraw.
 * @capability material-resource-metrics inspect loaded texture byte bounds and physical, coverage and transmission participation
 */
export function materialResourceMetrics(materials: readonly THREE.Material[]): { materials: number; textures: number; textureBytes: number; unknownTextureSizes: number; blendedMaterials: number; maskedMaterials: number; transmissionMaterials: number; doubleSidedMaterials: number; physicalMaterials: number } {
  const unique = new Set(materials);
  const textures = new Set<THREE.Texture>();
  let textureBytes = 0, unknownTextureSizes = 0, blendedMaterials = 0, maskedMaterials = 0, transmissionMaterials = 0, doubleSidedMaterials = 0, physicalMaterials = 0;
  for (const material of unique) {
    if (material.transparent) blendedMaterials++;
    if (material.alphaTest > 0) maskedMaterials++;
    if (material.side === THREE.DoubleSide) doubleSidedMaterials++;
    if ((material as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) physicalMaterials++;
    if ((material as THREE.MeshPhysicalMaterial).transmission > 0) transmissionMaterials++;
    for (const property of Object.values(MATERIAL_TEXTURE_PROPERTIES)) {
      const texture = (material as unknown as Record<string, unknown>)[property];
      if (texture instanceof THREE.Texture) textures.add(texture);
    }
  }
  for (const texture of textures) {
    if ((texture as THREE.CompressedTexture).isCompressedTexture) { textureBytes += texture.mipmaps.reduce((sum, mip) => sum + (mip as unknown as { data: Uint8Array }).data.byteLength, 0); continue; }
    const image = texture.image as { width?: number; height?: number } | undefined;
    if (image?.width === undefined || image.height === undefined) { unknownTextureSizes++; continue; }
    const components = texture.format === THREE.RedFormat ? 1 : texture.format === THREE.RGFormat ? 2 : 4;
    const bytes = texture.type === THREE.FloatType ? 4 : texture.type === THREE.HalfFloatType || texture.type === THREE.UnsignedShortType ? 2 : 1;
    let width = image.width, height = image.height;
    do {
      textureBytes += width * height * components * bytes;
      if (!texture.generateMipmaps || (width === 1 && height === 1)) break;
      width = Math.max(1, Math.floor(width / 2)); height = Math.max(1, Math.floor(height / 2));
    } while (true);
  }
  return { materials: unique.size, textures: textures.size, textureBytes, unknownTextureSizes, blendedMaterials, maskedMaterials, transmissionMaterials, doubleSidedMaterials, physicalMaterials };
}

/** Runtime imported-slot inventory for precise authoring selectors; indices address the mesh material array. */
export interface ModelMaterialSlotInfo {
  mesh: string;
  slot: string;
  slotIndex: number;
  materialType: string;
  uvSets: number[];
  tangents: boolean;
  physical: boolean;
}

/**
 * Inspect imported names, local slot indices and directional/map prerequisites without mutating the source.
 * @capability material-slots discover exact imported mesh and material selectors with UV and tangent prerequisites
 */
export function inspectModelMaterialSlots(root: THREE.Object3D): ModelMaterialSlotInfo[] {
  const result: ModelMaterialSlotInfo[] = [];
  root.traverse(node => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const uvSets = [0, 1, 2, 3].filter(index => mesh.geometry.getAttribute(index === 0 ? "uv" : `uv${index}`) !== undefined);
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material, slotIndex) => result.push({ mesh: mesh.name, slot: material.name, slotIndex, materialType: material.type, uvSets, tangents: mesh.geometry.getAttribute("tangent") !== undefined, physical: (material as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial === true }));
  });
  return result;
}

/** Loaded, owned map views for one model configuration. Loader sources and imported maps remain borrowed. @internal */
export function useModelMaterialTextures(model: Pick<ModelConfig, "material" | "materialAssets" | "materialAssignments">): { global: MaterialOverrideTextures; assets: ReadonlyMap<string, MaterialOverrideTextures> } {
  const ids = new Set(model.materialAssignments?.map(assignment => assignment.materialId));
  const referenced = (model.materialAssets ?? []).filter(asset => ids.has(asset.id));
  const key = JSON.stringify([model.material?.maps, referenced]);
  const entries = useMemo(() => {
    const result: { assetId?: string; role: MaterialTextureRole; metadata: MaterialTextureMetadata }[] = [];
    for (const [role, url] of Object.entries(model.material?.maps ?? {})) if (url !== undefined) result.push({ role: role as MaterialTextureRole, metadata: { url, colorSpace: MATERIAL_TEXTURE_SEMANTICS[role as MaterialTextureRole].colorSpace } });
    for (const asset of referenced) for (const [role, metadata] of Object.entries(asset.textures ?? {})) result.push({ assetId: asset.id, role: role as MaterialTextureRole, metadata: metadata! });
    return result;
  }, [key]);
  const renderer = useThree(state => state.gl);
  if (entries.some(entry => /\.ktx2(?:[?#]|$)/i.test(entry.metadata.url))) detectKtx2Support(renderer);
  const loaded = useLoader(MaterialTextureLoader, entries.map(entry => entry.metadata.url));
  const views = useDisposable(() => {
    const owned: THREE.Texture[] = [];
    try {
      entries.forEach((entry, index) => {
        const view = configureMaterialTexture(entry.role, entry.metadata, loaded[index]!);
        view.flipY = false;
        owned.push(view);
      });
      return owned;
    } catch (error) {
      owned.forEach(texture => texture.dispose());
      throw error;
    }
  }, [entries, loaded]);
  return useMemo(() => {
    const global: MaterialOverrideTextures = {};
    const assets = new Map<string, MaterialOverrideTextures>();
    entries.forEach((entry, index) => {
      if (entry.assetId === undefined) global[entry.role] = views[index]!;
      else {
        let textures = assets.get(entry.assetId);
        if (textures === undefined) { textures = {}; assets.set(entry.assetId, textures); }
        textures[entry.role] = views[index]!;
      }
    });
    return { global, assets };
  }, [entries, views]);
}

/**
 * Gate the existing thin-sheet hair-card scatter by sampled local light exposure, without changing scene exposure.
 * @capability material-appearance-signals apply sampled local exposure to the hair-card backlight approximation without global lighting edits
 */
export function setHairCardLightExposure(material: THREE.Material, exposure: number): void {
  if (!Number.isFinite(exposure)) throw new Error("Hair light exposure must be finite");
  const value = Math.max(0, Math.min(1, exposure));
  material.userData.jgHairLightExposure = value;
  const uniform = material.userData.jgHairBacklightUniform as { value: number } | undefined;
  if (uniform !== undefined) uniform.value = (material.userData.jgHairBacklightStrength as number) * value;
}
