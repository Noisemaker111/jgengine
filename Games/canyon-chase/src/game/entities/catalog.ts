import type { CatalogEntityRole, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";

export const PLAYER_CAR_ENTITY = "player_car";
export const SMUGGLER_TRUCK_ENTITY = "smuggler_truck";

export interface EntityCatalogDef {
  readonly id: string;
  readonly role: CatalogEntityRole;
}

export const entityCatalog: readonly EntityCatalogDef[] = [
  { id: PLAYER_CAR_ENTITY, role: "player" },
  { id: SMUGGLER_TRUCK_ENTITY, role: "vehicle" },
];

const entityDefById = new Map(entityCatalog.map((entry) => [entry.id, entry]));

export function entityContentById(id: string): GameContextEntityEntry | null {
  const def = entityDefById.get(id);
  if (def === undefined) return null;
  return { role: def.role };
}
