import type { DecorItemSpec } from "@llmville/game/world/mapTypes";
import {
  WORLD_MODEL_CATALOG,
  WORLD_MODEL_CATEGORY,
  type WorldModelAsset,
} from "@llmville/game/world/worldModelCatalog";

export type BuilderCategory = "asset" | "gpu";

export type BuilderPlaceableSource =
  | { kind: "catalog"; modelKey: string }
  | { kind: "decor"; template: DecorItemSpec };

export interface BuilderPlaceableItem {
  id: string;
  label: string;
  category: BuilderCategory;
  source: BuilderPlaceableSource;
}

const STATIC_PLACEABLES: readonly BuilderPlaceableItem[] = [] as const;

const DEFAULT_PLACEABLE_ID: Partial<Record<BuilderCategory, string>> = {
  asset: "potted_plant",
  gpu: "gpu_1",
};

function builderCategoryForCatalogEntry(modelKey: string, asset: WorldModelAsset): BuilderCategory {
  if (asset.category === WORLD_MODEL_CATEGORY.hardware || modelKey.startsWith("gpu_")) {
    return "gpu";
  }
  return "asset";
}

function catalogPlaceables(): BuilderPlaceableItem[] {
  return Object.entries(WORLD_MODEL_CATALOG).map(([modelKey, asset]) => ({
    id: modelKey,
    label: asset.label,
    category: builderCategoryForCatalogEntry(modelKey, asset),
    source: { kind: "catalog", modelKey },
  }));
}

function sortPlaceables(items: readonly BuilderPlaceableItem[]): BuilderPlaceableItem[] {
  return [...items].sort((left, right) => left.label.localeCompare(right.label));
}

export const BUILDER_PLACEABLE_ITEMS: readonly BuilderPlaceableItem[] = sortPlaceables([
  ...catalogPlaceables(),
  ...STATIC_PLACEABLES,
]);

export const BUILDER_CATEGORY_LABELS: Record<BuilderCategory, string> = {
  asset: "Asset",
  gpu: "GPU",
};

export const ASSET_VIEWER_SECTIONS: readonly {
  category: BuilderCategory;
  label: string;
  items: readonly BuilderPlaceableItem[];
}[] = [
  { category: "asset", label: "Assets", items: placeablesForCategory("asset") },
  { category: "gpu", label: "GPUs", items: placeablesForCategory("gpu") },
];

export function placeablesForCategory(category: BuilderCategory): readonly BuilderPlaceableItem[] {
  return BUILDER_PLACEABLE_ITEMS.filter((item) => item.category === category);
}

export function defaultPlaceableForCategory(category: BuilderCategory): BuilderPlaceableItem {
  const items = placeablesForCategory(category);
  const preferredId = DEFAULT_PLACEABLE_ID[category];
  if (preferredId) {
    const preferred = items.find((item) => item.id === preferredId);
    if (preferred) return preferred;
  }
  return items[0] ?? BUILDER_PLACEABLE_ITEMS[0];
}

export function findPlaceableItem(id: string): BuilderPlaceableItem | undefined {
  return BUILDER_PLACEABLE_ITEMS.find((item) => item.id === id);
}

export function findPlaceableByCatalogModel(modelKey: string): BuilderPlaceableItem | undefined {
  return BUILDER_PLACEABLE_ITEMS.find(
    (item) => item.source.kind === "catalog" && item.source.modelKey === modelKey,
  );
}

export function isCatalogBuilderCategory(category: BuilderCategory): boolean {
  return category === "asset" || category === "gpu";
}