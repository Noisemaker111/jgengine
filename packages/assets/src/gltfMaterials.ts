import type { GLTF } from "@gltf-transform/core";
import type { MaterialTextureMetadata, MaterialTextureRole } from "@jgengine/core/material/materialAsset";

/** Native material/texture extensions implemented by Three.js GLTFLoader r182. Decoders are still required. */
export const GLTF_MATERIAL_EXTENSIONS_R182: readonly string[] = [
  "KHR_materials_anisotropy", "KHR_materials_clearcoat", "KHR_materials_dispersion",
  "KHR_materials_emissive_strength", "KHR_materials_ior", "KHR_materials_iridescence",
  "KHR_materials_sheen", "KHR_materials_specular", "KHR_materials_transmission",
  "KHR_materials_unlit", "KHR_materials_volume", "EXT_materials_bump",
  "KHR_texture_transform", "KHR_texture_basisu", "EXT_texture_webp", "EXT_texture_avif",
];

/** A native glTF texture use; embedded images retain their source index instead of an invented URL. */
export interface GltfMaterialTexture {
  /** Bump is native normal perturbation, distinct from authored height displacement. */
  role: MaterialTextureRole | "bump";
  texture: number;
  image: number;
  sourceExtension?: string;
  mimeType?: string;
  bufferView?: number;
  metadata: Omit<MaterialTextureMetadata, "url"> & { url?: string };
  /** Packed source channel meanings; anisotropy RG direction is remapped to [-1, 1]. */
  channels: Readonly<Record<string, string>>;
  /** Complete native textureInfo, including unrecognized extensions. */
  native: GLTF.ITextureInfo;
}

/** One imported material with the native definition retained as an independent JSON snapshot. */
export interface GltfImportedMaterial {
  /** Stable within the pinned model bytes; duplicate or absent material names are safe. */
  id: string;
  index: number;
  name?: string;
  alphaMode: "OPAQUE" | "MASK" | "BLEND";
  alphaCutoff: number;
  doubleSided: boolean;
  extensions: readonly string[];
  textures: readonly GltfMaterialTexture[];
  native: GLTF.IMaterial;
}

/** A primitive slot retains mesh and material indices even when display names collide. */
export interface GltfMaterialSlot {
  id: string;
  mesh: number;
  meshName?: string;
  primitive: number;
  material?: number;
  materialId?: string;
  materialName?: string;
  nodes: readonly { index: number; name?: string }[];
  uvSets: readonly number[];
  hasNormals: boolean;
  hasTangents: boolean;
}

/** Actionable fidelity warning or error; this inspector never changes imported surfaces. */
export interface GltfMaterialDiagnostic {
  severity: "warning" | "error";
  code: "unsupported-extension" | "missing-uv" | "missing-tangent-space" | "incompatible-extensions" | "missing-transmission" | "different-direction-uv";
  path: string;
  message: string;
}

/** Native material inventory, primitive selectors, attribution, and renderer compatibility diagnostics. */
export interface GltfMaterialInspection {
  assetId: string;
  materials: readonly GltfImportedMaterial[];
  slots: readonly GltfMaterialSlot[];
  diagnostics: readonly GltfMaterialDiagnostic[];
  copyright?: string;
  extras?: unknown;
}

type MapSpec = readonly [GltfMaterialTexture["role"], string, MaterialTextureMetadata["colorSpace"], NonNullable<MaterialTextureMetadata["channel"]>, Readonly<Record<string, string>>];
const maps: Readonly<Record<string, readonly MapSpec[]>> = {
  pbrMetallicRoughness: [
    ["color", "baseColorTexture", "srgb", "rgba", { rgb: "base color", a: "linear alpha coverage" }],
    ["roughness", "metallicRoughnessTexture", "linear", "g", { g: "roughness", b: "metalness" }],
    ["metalness", "metallicRoughnessTexture", "linear", "b", { g: "roughness", b: "metalness" }],
  ],
  material: [
    ["normal", "normalTexture", "linear", "rgb", { rgb: "OpenGL tangent normal" }],
    ["ao", "occlusionTexture", "linear", "r", { r: "ambient occlusion" }],
    ["emissive", "emissiveTexture", "srgb", "rgb", { rgb: "emissive color" }],
  ],
  KHR_materials_sheen: [
    ["sheenColor", "sheenColorTexture", "srgb", "rgb", { rgb: "sheen color" }],
    ["sheenRoughness", "sheenRoughnessTexture", "linear", "a", { a: "sheen roughness" }],
  ],
  KHR_materials_anisotropy: [["anisotropy", "anisotropyTexture", "linear", "rgb", { rg: "tangent direction [-1, 1]", b: "anisotropy strength" }]],
  KHR_materials_clearcoat: [
    ["clearcoat", "clearcoatTexture", "linear", "r", { r: "clearcoat intensity" }],
    ["clearcoatRoughness", "clearcoatRoughnessTexture", "linear", "g", { g: "clearcoat roughness" }],
    ["clearcoatNormal", "clearcoatNormalTexture", "linear", "rgb", { rgb: "OpenGL tangent normal" }],
  ],
  KHR_materials_specular: [
    ["specularIntensity", "specularTexture", "linear", "a", { a: "specular intensity" }],
    ["specularColor", "specularColorTexture", "srgb", "rgb", { rgb: "specular color" }],
  ],
  KHR_materials_transmission: [["transmission", "transmissionTexture", "linear", "r", { r: "transmission" }]],
  KHR_materials_volume: [["thickness", "thicknessTexture", "linear", "g", { g: "volume thickness" }]],
  KHR_materials_iridescence: [
    ["iridescence", "iridescenceTexture", "linear", "r", { r: "iridescence intensity" }],
    ["iridescenceThickness", "iridescenceThicknessTexture", "linear", "g", { g: "iridescence thickness" }],
  ],
  EXT_materials_bump: [["bump", "bumpTexture", "linear", "r", { r: "normal perturbation height" }]],
};

const wraps = { 10497: "repeat", 33071: "clamp", 33648: "mirror" } as const;
const filters = { 9728: "nearest", 9729: "linear", 9984: "nearest-mipmap-nearest", 9985: "linear-mipmap-nearest", 9986: "nearest-mipmap-linear", 9987: "linear-mipmap-linear" } as const;

function binding(json: GLTF.IGLTF, info: GLTF.ITextureInfo, spec: MapSpec, path: string): GltfMaterialTexture {
  const [role, , colorSpace, channel, channels] = spec;
  const texture = json.textures?.[info.index];
  if (!Number.isSafeInteger(info.index) || texture === undefined) throw new Error(`${path}: missing texture ${info.index}`);
  const sourceExtension = ["KHR_texture_basisu", "EXT_texture_webp", "EXT_texture_avif"].find((name) => texture.extensions?.[name] !== undefined);
  const extension = sourceExtension === undefined ? undefined : texture.extensions?.[sourceExtension] as { source: number };
  const imageIndex = extension?.source ?? texture.source;
  const image = imageIndex === undefined ? undefined : json.images?.[imageIndex];
  if (image === undefined || imageIndex === undefined || !Number.isSafeInteger(imageIndex)) throw new Error(`${path}: missing image ${imageIndex}`);
  const transform = info.extensions?.KHR_texture_transform as { offset?: [number, number]; scale?: [number, number]; rotation?: number; texCoord?: number } | undefined;
  const uvSet = transform?.texCoord ?? info.texCoord ?? 0;
  if (!Number.isInteger(uvSet) || uvSet < 0 || uvSet > 3) throw new Error(`${path}: Three.js r182 supports UV sets 0–3; found ${uvSet}`);
  const sampler = texture.sampler === undefined ? undefined : json.samplers?.[texture.sampler];
  if (texture.sampler !== undefined && sampler === undefined) throw new Error(`${path}: missing sampler ${texture.sampler}`);
  const compression = sourceExtension === "KHR_texture_basisu" ? "basisu" : sourceExtension === "EXT_texture_webp" ? "webp" : image.mimeType === "image/ktx2" ? "ktx2" : undefined;
  return {
    role, texture: info.index, image: imageIndex, ...(sourceExtension === undefined ? {} : { sourceExtension }),
    ...(image.mimeType === undefined ? {} : { mimeType: image.mimeType }),
    ...(image.bufferView === undefined ? {} : { bufferView: image.bufferView }),
    metadata: {
      ...(image.uri === undefined ? {} : { url: image.uri }), colorSpace, channel, uvSet: uvSet as 0 | 1 | 2 | 3,
      ...(role === "normal" || role === "clearcoatNormal" ? { normalConvention: "opengl" } : {}),
      ...(transform === undefined ? {} : { transform: {
        ...(transform.offset === undefined ? {} : { offset: [...transform.offset] as [number, number] }),
        ...(transform.scale === undefined ? {} : { scale: [...transform.scale] as [number, number] }),
        ...(transform.rotation === undefined ? {} : { rotation: transform.rotation }),
      } }),
      ...(sampler === undefined ? {} : { sampler: {
        wrapS: wraps[(sampler.wrapS ?? 10497) as keyof typeof wraps], wrapT: wraps[(sampler.wrapT ?? 10497) as keyof typeof wraps],
        ...(sampler.minFilter === undefined ? {} : { minFilter: filters[sampler.minFilter as keyof typeof filters] }),
        ...(sampler.magFilter === undefined ? {} : { magFilter: filters[sampler.magFilter as 9728 | 9729] }),
      } }),
      ...(compression === undefined ? {} : { compression }),
    }, channels: { ...channels }, native: structuredClone(info),
  };
}

/**
 * Inventory validated glTF JSON without flattening slots, decoding compressed geometry, or changing materials.
 * IDs use the supplied model namespace plus source indices, and remain stable while its pinned bytes remain stable.
 * @capability gltf-material-inspection inspect native material slots, packed maps, attribution and compatibility
 */
export function inspectGltfMaterials(json: GLTF.IGLTF, assetId: string): GltfMaterialInspection {
  if (json?.asset?.version !== "2.0" || assetId.trim() === "") throw new Error("Material inspection requires glTF 2.0 and a nonempty asset id");
  const diagnostics: GltfMaterialDiagnostic[] = [];
  const diagnostic = (severity: GltfMaterialDiagnostic["severity"], code: GltfMaterialDiagnostic["code"], path: string, message: string) => diagnostics.push({ severity, code, path, message });
  const supported = new Set([...GLTF_MATERIAL_EXTENSIONS_R182, "KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_mesh_quantization", "KHR_lights_punctual"]);
  for (const name of new Set([...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])])) {
    if (!supported.has(name)) diagnostic(json.extensionsRequired?.includes(name) ? "error" : "warning", "unsupported-extension", "extensionsUsed", `${name} has no native Three.js r182 loader implementation; register a compatible loader plugin or retain the source asset outside this renderer`);
  }
  const materials = (json.materials ?? []).map((material, index): GltfImportedMaterial => {
    const textures: GltfMaterialTexture[] = [];
    const extensions = Object.keys(material.extensions ?? {});
    for (const [name, specs] of Object.entries(maps)) {
      const source = name === "material" ? material : name === "pbrMetallicRoughness" ? material.pbrMetallicRoughness : material.extensions?.[name];
      for (const spec of specs) {
        const info = (source as Record<string, unknown> | undefined)?.[spec[1]] as GLTF.ITextureInfo | undefined;
        if (info !== undefined) textures.push(binding(json, info, spec, `materials[${index}].${spec[1]}`));
      }
    }
    if (extensions.includes("KHR_materials_unlit") && extensions.some((name) => /^KHR_materials_/.test(name) && name !== "KHR_materials_unlit"))
      diagnostic("error", "incompatible-extensions", `materials[${index}]`, "Unlit materials cannot retain a physical surface response; choose one shading model");
    if (extensions.includes("KHR_materials_pbrSpecularGlossiness") && extensions.some((name) => /^KHR_materials_/.test(name) && name !== "KHR_materials_pbrSpecularGlossiness" && name !== "KHR_materials_emissive_strength"))
      diagnostic("error", "incompatible-extensions", `materials[${index}]`, "Legacy specular/glossiness cannot be combined with metallic/roughness physical material extensions");
    if (extensions.includes("KHR_materials_volume") && !extensions.includes("KHR_materials_transmission"))
      diagnostic("warning", "missing-transmission", `materials[${index}]`, "Volume thickness and attenuation require transmission to contribute to transmitted light");
    const normal = textures.find((texture) => texture.role === "normal");
    const direction = textures.find((texture) => texture.role === "anisotropy");
    if (normal !== undefined && direction !== undefined && normal.metadata.uvSet !== direction.metadata.uvSet)
      diagnostic("warning", "different-direction-uv", `materials[${index}]`, "Normal and anisotropy textures should share their tangent-space UV set");
    return {
      id: `${assetId}/material/${index}`, index, ...(material.name === undefined ? {} : { name: material.name }),
      alphaMode: material.alphaMode ?? "OPAQUE", alphaCutoff: material.alphaCutoff ?? 0.5,
      doubleSided: material.doubleSided ?? false, extensions, textures, native: structuredClone(material),
    };
  });
  const slots = (json.meshes ?? []).flatMap((mesh, meshIndex) => mesh.primitives.map((primitive, primitiveIndex): GltfMaterialSlot => {
    const material = primitive.material === undefined ? undefined : materials[primitive.material];
    if (primitive.material !== undefined && material === undefined) throw new Error(`meshes[${meshIndex}].primitives[${primitiveIndex}]: missing material ${primitive.material}`);
    const uvSets = Object.keys(primitive.attributes).flatMap((name) => /^TEXCOORD_\d+$/.test(name) ? [Number(name.slice(9))] : []).sort((a, b) => a - b);
    const hasNormals = primitive.attributes.NORMAL !== undefined;
    const hasTangents = primitive.attributes.TANGENT !== undefined;
    const path = `meshes[${meshIndex}].primitives[${primitiveIndex}]`;
    for (const texture of material?.textures ?? []) if ((!material?.extensions.includes("KHR_materials_unlit") || texture.role === "color") && !uvSets.includes(texture.metadata.uvSet ?? 0))
      diagnostic("error", "missing-uv", path, `${texture.role} uses missing TEXCOORD_${texture.metadata.uvSet ?? 0}`);
    if (material?.extensions.includes("KHR_materials_anisotropy") && !(hasNormals && hasTangents) && !material.textures.some((texture) => texture.role === "normal"))
      diagnostic("error", "missing-tangent-space", path, "Anisotropy requires NORMAL and TANGENT attributes or a normal texture with UVs from which tangent space can be derived");
    return {
      id: `${assetId}/mesh/${meshIndex}/primitive/${primitiveIndex}`, mesh: meshIndex,
      ...(mesh.name === undefined ? {} : { meshName: mesh.name }), primitive: primitiveIndex,
      ...(material === undefined ? {} : { material: material.index, materialId: material.id, ...(material.name === undefined ? {} : { materialName: material.name }) }),
      nodes: (json.nodes ?? []).flatMap((node, index) => node.mesh !== meshIndex ? [] : [{ index, ...(node.name === undefined ? {} : { name: node.name }) }]),
      uvSets, hasNormals, hasTangents,
    };
  }));
  return {
    assetId, materials, slots, diagnostics,
    ...(json.asset.copyright === undefined ? {} : { copyright: json.asset.copyright }),
    ...(json.asset.extras === undefined ? {} : { extras: structuredClone(json.asset.extras) }),
  };
}

/**
 * Inspect the JSON chunk of complete GLB v2 bytes, including models with compressed geometry.
 * This measures material metadata only; it never decodes geometry or resolves image URLs.
 * @capability gltf-material-inspection inspect material slots and texture metadata directly from complete GLB bytes
 */
export function inspectGlbMaterials(bytes: Uint8Array, assetId: string): GltfMaterialInspection {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length)
    throw new Error("Material inspection requires complete GLB v2 bytes");
  let json: GLTF.IGLTF | undefined;
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) throw new Error("Truncated GLB material chunk header");
    const size = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (size % 4 !== 0 || start + size > bytes.length) throw new Error("Invalid GLB material chunk length");
    if (offset === 12 && type !== 0x4e4f534a) throw new Error("First GLB chunk must contain JSON");
    if (type === 0x4e4f534a) {
      if (json !== undefined) throw new Error("Duplicate GLB JSON chunk");
      json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(start, start + size))) as GLTF.IGLTF;
    }
    offset = start + size;
  }
  if (json === undefined) throw new Error("Missing GLB material JSON");
  return inspectGltfMaterials(json, assetId);
}
