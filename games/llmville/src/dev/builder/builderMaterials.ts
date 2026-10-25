/**
 * App material palette for the builder: tier surface materials plus diorama
 * presets, resolved against the map's material registry.
 */
import type { MaterialRegistry } from "@llmville/game/world/mapTypes";
import type { BuilderMaterial } from "@llmville/game/builder/operations";
import {
  getMaterialPreset,
  MATERIAL_PRESET,
  type MaterialPreset,
} from "@/world/diorama/palette";

export interface BuilderMaterialOption extends BuilderMaterial {
  label: string;
  category: "floor" | "wall" | "object";
}

const PRESET_MATERIALS: readonly {
  key: string;
  label: string;
  category: BuilderMaterialOption["category"];
  preset: MaterialPreset;
}[] = [
  { key: "preset:wood", label: "Wood", category: "object", preset: MATERIAL_PRESET.wood },
  { key: "preset:painted", label: "Painted cream", category: "object", preset: MATERIAL_PRESET.painted },
  { key: "preset:metal", label: "Metal", category: "object", preset: MATERIAL_PRESET.metal },
  { key: "preset:metal-dark", label: "Dark metal", category: "object", preset: MATERIAL_PRESET.metalDark },
  { key: "preset:accent-teal", label: "Accent teal", category: "object", preset: MATERIAL_PRESET.accentTeal },
  { key: "preset:accent-coral", label: "Accent coral", category: "object", preset: MATERIAL_PRESET.accentCoral },
  { key: "preset:accent-amber", label: "Accent amber", category: "object", preset: MATERIAL_PRESET.accentAmber },
  { key: "preset:emissive-warm", label: "Warm emissive", category: "object", preset: MATERIAL_PRESET.emissiveWarm },
  { key: "preset:emissive-cool", label: "Cool emissive", category: "object", preset: MATERIAL_PRESET.emissiveCool },
  { key: "preset:glass", label: "Glass", category: "object", preset: MATERIAL_PRESET.glass },
];

export const BUILDER_MATERIAL_OPTIONS: readonly BuilderMaterialOption[] = [
  { key: "garage-floor", label: "Garage floor", category: "floor", color: "#6e7672", roughness: 0.82, metalness: 0.05 },
  { key: "garage-wall", label: "Garage wall", category: "wall", color: "#828c87", roughness: 0.78, metalness: 0.05 },
  { key: "house-floor", label: "House floor", category: "floor", color: "#c39b6b", roughness: 0.72, metalness: 0 },
  { key: "house-wall", label: "House wall", category: "wall", color: "#e8dfcc", roughness: 0.85, metalness: 0 },
  { key: "datacenter-floor", label: "Datacenter floor", category: "floor", color: "#566062", roughness: 0.58, metalness: 0.18 },
  { key: "datacenter-wall", label: "Datacenter wall", category: "wall", color: "#424c4e", roughness: 0.62, metalness: 0.18 },
  ...PRESET_MATERIALS.map(({ key, label, category, preset }) => {
    const material = getMaterialPreset(preset);
    return {
      key,
      label,
      category,
      color: material.color,
      roughness: material.roughness,
      metalness: material.metalness,
      ...(material.emissive !== undefined ? { emissive: material.emissive } : {}),
      ...(material.emissiveIntensity !== undefined ? { emissiveIntensity: material.emissiveIntensity } : {}),
    };
  }),
];

export function resolveMaterial(key: string, registry: MaterialRegistry = {}): BuilderMaterialOption {
  const local = BUILDER_MATERIAL_OPTIONS.find((option) => option.key === key);
  const registered = registry[key];
  if (!registered) {
    return local ?? BUILDER_MATERIAL_OPTIONS[0];
  }
  return {
    key,
    label: local?.label ?? key,
    category: local?.category ?? "object",
    color: registered.color ?? local?.color ?? "#94a3b8",
    roughness: registered.roughness ?? local?.roughness ?? 0.8,
    metalness: registered.metalness ?? local?.metalness ?? 0,
  };
}
