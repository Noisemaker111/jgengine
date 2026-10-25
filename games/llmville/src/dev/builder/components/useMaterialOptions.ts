import { useMemo } from "react";

import {
  BUILDER_MATERIAL_OPTIONS,
  type BuilderMaterialOption,
} from "@/dev/builder/builderStore";
import type { MaterialRegistry } from "@llmville/game/world/mapTypes";

export function useMaterialOptions(registry: MaterialRegistry): readonly BuilderMaterialOption[] {
  return useMemo(() => {
    const known = new Set(BUILDER_MATERIAL_OPTIONS.map((material) => material.key));
    const registered = Object.entries(registry)
      .filter(([key]) => !known.has(key))
      .map(([key, entry]) => ({
        key,
        label: key,
        category: "object" as const,
        color: entry.color ?? "#94a3b8",
        roughness: entry.roughness ?? 0.8,
        metalness: entry.metalness ?? 0,
      }));
    return [...BUILDER_MATERIAL_OPTIONS, ...registered];
  }, [registry]);
}
