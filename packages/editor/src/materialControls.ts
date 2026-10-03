import { materialCapabilitiesForAsset, type MaterialAsset, type MaterialFamily, type MaterialSurfaceParameters } from "@jgengine/core/material/materialAsset";

/** Prepare an explicit artist edit by retaining declarations and adding its shader requirements. @internal */
export function prepareMaterialAuthoringEdit(asset: MaterialAsset): MaterialAsset {
  return { ...asset, capabilities: [...new Set([...asset.capabilities, ...materialCapabilitiesForAsset(asset)])] };
}

/** One physical surface field in the material workspace. */
export interface MaterialControl {
  key: keyof MaterialSurfaceParameters;
  label: string;
  kind: "number" | "color";
  fallback: number | string;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}

/** A family-specific group of primary controls; maps and full physical fields remain available. */
export interface MaterialControlGroup {
  label: string;
  hint: string;
  controls: readonly MaterialControl[];
}

const color: MaterialControl = { key: "color", label: "Base color", kind: "color", fallback: "#ffffff" };
const roughness: MaterialControl = { key: "roughness", label: "Roughness", kind: "number", fallback: 1, min: 0, max: 1, step: 0.01 };
const metalness: MaterialControl = { key: "metalness", label: "Metalness", kind: "number", fallback: 0, min: 0, max: 1, step: 0.01 };
const anisotropy: MaterialControl = { key: "anisotropy", label: "Directional highlight", kind: "number", fallback: 0, min: 0, max: 1, step: 0.01 };
const rotation: MaterialControl = { key: "anisotropyRotation", label: "Highlight direction (radians)", kind: "number", fallback: 0, min: -Math.PI, max: Math.PI, step: 0.01 };
const sheen: MaterialControl = { key: "sheen", label: "Grazing sheen", kind: "number", fallback: 0, min: 0, max: 1, step: 0.01 };
const sheenRoughness: MaterialControl = { key: "sheenRoughness", label: "Sheen roughness", kind: "number", fallback: 1, min: 0.07, max: 1, step: 0.01 };
const coat: MaterialControl = { key: "clearcoat", label: "Coating", kind: "number", fallback: 0, min: 0, max: 1, step: 0.01 };
const coatRoughness: MaterialControl = { key: "clearcoatRoughness", label: "Coating roughness", kind: "number", fallback: 0, min: 0, max: 1, step: 0.01 };
const ior: MaterialControl = { key: "ior", label: "Index of refraction", kind: "number", fallback: 1.5, min: 1, max: 2.333, step: 0.01 };
const specular: MaterialControl = { key: "specularIntensity", label: "Specular intensity", kind: "number", fallback: 1, min: 0, max: 1, step: 0.01 };
const transmission: MaterialControl = { key: "transmission", label: "Transmission", kind: "number", fallback: 0, min: 0, max: 1, step: 0.01, hint: "Light through a surface. Keep opacity at 1 for physical transmission." };
const thickness: MaterialControl = { key: "thickness", label: "Thickness", kind: "number", fallback: 0, min: 0, step: 0.01 };
const opacity: MaterialControl = { key: "opacity", label: "Opacity", kind: "number", fallback: 1, min: 0, max: 1, step: 0.01 };
const cutoff: MaterialControl = { key: "alphaCutoff", label: "Mask cutoff", kind: "number", fallback: 0.5, min: 0, max: 1, step: 0.01 };
const base: MaterialControlGroup = { label: "Base", hint: "Surface color multiplies the base-color map.", controls: [color] };
const highlights: MaterialControlGroup = { label: "Highlights", hint: "Microsurface roughness controls the width of reflections.", controls: [roughness] };
const detail: MaterialControlGroup = { label: "Detail", hint: "Assign normal and roughness maps below; their UVs and scale belong to each texture.", controls: [] };
const coverage: MaterialControlGroup = { label: "Coverage", hint: "Alpha masking cuts holes; blending changes coverage. Neither is physical transmission.", controls: [opacity, cutoff] };

/**
 * Returns six primary groups suited to the material family without hiding the physical model.
 * @capability editor-material-controls Group physical controls by surface family while retaining advanced fields.
 */
export function materialControlGroups(family: MaterialFamily): readonly MaterialControlGroup[] {
  switch (family) {
    case "fabric": return [base, highlights,
      { label: "Fibre sheen", hint: "Sheen approximates grazing fuzz; it does not add fibres to the silhouette.", controls: [sheen, sheenRoughness] },
      { label: "Weave direction", hint: "Directional silk highlights need valid UVs and normals. Tangents improve authored orientation.", controls: [anisotropy, rotation] }, detail, coverage];
    case "hair": return [base, highlights,
      { label: "Strand highlights", hint: "A directional physical lobe approximates card or strand highlights; this is not a dedicated hair scattering model.", controls: [anisotropy, rotation] },
      { label: "Backlighting", hint: "The hair-card adapter adds an approximate light response from behind. It does not provide hair multiple scattering.", controls: [] }, detail, coverage];
    case "glass": return [base, highlights,
      { label: "Transmission", hint: "Use opaque coverage with transmission. Refraction needs content behind the glass.", controls: [transmission, ior] },
      { label: "Volume", hint: "Thickness and attenuation approximate the distance travelled through the medium.", controls: [thickness, { key: "attenuationColor", label: "Attenuation color", kind: "color", fallback: "#ffffff" }, { key: "attenuationDistance", label: "Attenuation distance", kind: "number", fallback: 1, min: 0.001, step: 0.01 }] }, detail, coverage];
    case "metal": return [base, highlights,
      { label: "Metal response", hint: "Metalness blends conductor and dielectric response.", controls: [metalness] },
      { label: "Brush direction", hint: "Directional highlights require UVs and normals; geometry and a direction map define the brushing.", controls: [anisotropy, rotation] }, detail,
      { label: "Coating", hint: "A separate clear surface lobe overlays the substrate.", controls: [coat, coatRoughness] }];
    default: return [base, highlights,
      { label: "Surface response", hint: family === "skin" ? "Standard surface response approximates skin; subsurface scattering is not provided." : "Dielectric specular response and metallic coverage.", controls: [metalness, specular, ior] },
      { label: "Coating", hint: "Clearcoat adds a surface lobe; geometry remains unchanged.", controls: [coat, coatRoughness] }, detail, coverage];
  }
}

/** Complete supported physical scalar/color fields, independent of the six primary groups. */
export const advancedMaterialControls: readonly MaterialControl[] = [
  color, roughness, metalness, specular, ior,
  { key: "specularColor", label: "Specular color", kind: "color", fallback: "#ffffff" },
  sheen, sheenRoughness, { key: "sheenColor", label: "Sheen color", kind: "color", fallback: "#000000" },
  anisotropy, rotation, coat, coatRoughness, transmission, thickness,
  { key: "attenuationColor", label: "Attenuation color", kind: "color", fallback: "#ffffff" },
  { key: "attenuationDistance", label: "Attenuation distance", kind: "number", fallback: 1, min: 0.001, step: 0.01 },
  { key: "iridescence", label: "Iridescence", kind: "number", fallback: 0, min: 0, max: 1, step: 0.01 },
  { key: "iridescenceIOR", label: "Film index of refraction", kind: "number", fallback: 1.3, min: 1, step: 0.01 },
  { key: "emissive", label: "Emissive color", kind: "color", fallback: "#000000" },
  { key: "emissiveIntensity", label: "Emissive intensity", kind: "number", fallback: 1, min: 0, step: 0.1 }, opacity, cutoff,
];

/**
 * Reports geometry prerequisites and renderer approximations to authors.
 * @capability editor-material-controls Explain geometry prerequisites and approximations for a material asset.
 */
export function materialAuthoringNotes(asset: MaterialAsset): readonly string[] {
  const notes: string[] = [];
  if (asset.family === "fabric") notes.push("Material controls do not bend cloth, add collision, or create fibre geometry.");
  if (asset.family === "hair") notes.push("Cards or strand geometry must be authored separately. This approximation supplies coverage and directional highlights, not a groom, collision, motion, or a hair scattering model.");
  if (asset.family === "skin") notes.push("Skin uses physical surface shading. Subsurface scattering is not implemented.");
  if ((asset.surface.anisotropy ?? 0) > 0) notes.push("Directional highlights need valid mesh UVs and normals; authored tangents or a direction map control orientation.");
  if ((asset.surface.transmission ?? 0) > 0) notes.push("Transmission adds a renderer pass. Use opacity 1; inspect front, grazing, and backlit views.");
  return notes;
}
