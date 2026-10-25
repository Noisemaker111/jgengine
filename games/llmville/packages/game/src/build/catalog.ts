import { RACK_CATALOG_ID_VALUES } from "@llmville/game/infrastructure/catalog";
import { STORE_CATALOG } from "@llmville/game/store/storeCatalog";
import { DECOR_BUILD_ITEM_ID_VALUES, type DecorBuildItemId } from "@llmville/game/store/decorCatalog";

export const BUILD_TAB_ID_VALUES = ["infrastructure", "decor"] as const;
export type BuildTabId = (typeof BUILD_TAB_ID_VALUES)[number];

export const INFRASTRUCTURE_BUILD_ITEM_ID_VALUES = RACK_CATALOG_ID_VALUES;
export { DECOR_BUILD_ITEM_ID_VALUES };
export const BUILD_ITEM_ID_VALUES = [
  ...INFRASTRUCTURE_BUILD_ITEM_ID_VALUES,
  ...DECOR_BUILD_ITEM_ID_VALUES,
] as const;

export type InfrastructureBuildItemId = (typeof INFRASTRUCTURE_BUILD_ITEM_ID_VALUES)[number];
export type PlaceableBuildItemId = DecorBuildItemId;
export type BuildItemId = (typeof BUILD_ITEM_ID_VALUES)[number];
export type BuildDirection = 0 | 1 | 2 | 3;

export interface BuildItemDefinition {
  id: BuildItemId;
  tab: BuildTabId;
  label: string;
  description: string;
  price: number;
  passiveBoost?: number;
}

export type BuildInventory = Record<BuildItemId, number>;
export type BuildInventoryInput = Partial<Record<BuildItemId, number>>;

export const BUILD_ITEM_RESALE_MULTIPLIER = 0.8;

const buildFromStore = [
  ...STORE_CATALOG.infrastructure,
  ...STORE_CATALOG.decor,
];

function buildTabForItemId(itemId: string): BuildTabId {
  return (STORE_CATALOG.infrastructure as readonly { id: string }[]).some((entry) => entry.id === itemId)
    ? "infrastructure"
    : "decor";
}

function buildItemDefinition(item: { id: string; label: string; description: string; price: number }): BuildItemDefinition {
  const passiveBoost =
    item.id === "starter_rack" ? 1 :
    item.id === "air_rack_4" ? 2 :
    item.id === "medium_server_rack_24" ? 2 : undefined;

  return {
    id: item.id as BuildItemId,
    tab: buildTabForItemId(item.id),
    label: item.label,
    description: item.description,
    price: item.price,
    passiveBoost,
  };
}

export const BUILD_CATALOG = buildFromStore.map(buildItemDefinition) satisfies readonly BuildItemDefinition[];

const BUILD_ITEM_BY_ID = Object.fromEntries(
  BUILD_CATALOG.map((item) => [item.id, item]),
) as Record<BuildItemId, BuildItemDefinition>;

export const DEFAULT_BUILD_INVENTORY = Object.fromEntries(
  BUILD_ITEM_ID_VALUES.map((itemId) => [itemId, 0]),
) as BuildInventory;

export function getBuildItem(id: BuildItemId): BuildItemDefinition {
  return BUILD_ITEM_BY_ID[id];
}

export function isBuildItemId(value: string): value is BuildItemId {
  return value in BUILD_ITEM_BY_ID;
}

export function isInfrastructureBuildItem(id: BuildItemId): id is InfrastructureBuildItemId {
  return INFRASTRUCTURE_BUILD_ITEM_ID_VALUES.includes(id as InfrastructureBuildItemId);
}

export function isPlaceableBuildItem(id: BuildItemId): id is PlaceableBuildItemId {
  return (DECOR_BUILD_ITEM_ID_VALUES as readonly string[]).includes(id);
}

export function normalizeBuildInventory(inventory?: Partial<Record<BuildItemId, number>>): BuildInventory {
  return {
    ...DEFAULT_BUILD_INVENTORY,
    ...(inventory ?? {}),
  };
}

export function computeBuildResaleValue(price: number): number {
  return Math.max(1, Math.floor(price * BUILD_ITEM_RESALE_MULTIPLIER));
}

export function getBuildItemResaleValue(id: BuildItemId): number {
  return computeBuildResaleValue(getBuildItem(id).price);
}