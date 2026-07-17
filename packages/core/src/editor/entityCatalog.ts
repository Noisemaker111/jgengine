import type { CatalogEntityRole, GameContextEntityEntry } from "../runtime/gameContext";
import { parseParams, type ParamSchema } from "../scene/sceneKinds";
import type { EditorCatalogData, EditorCatalogDefinition } from "./types";

/**
 * Well-known catalog id for authored entity definitions. A `mob`/`boss` marker's `catalogId`
 * references an entry (row) in this catalog, and {@link entityEntryFromCatalog} turns that row into
 * the runtime {@link GameContextEntityEntry} a spawn consumes — so an entity's stats and speed are
 * authored in the editor Data tab, not hardcoded in game TS.
 */
export const ENTITY_CATALOG_ID = "entities";

const ENTITY_ROLES: readonly CatalogEntityRole[] = ["player", "enemy", "hostile", "npc", "vehicle"];

/**
 * The default {@link ParamSchema} for an authored entity definition — role, health, movement speed,
 * and visual scale. Drives the editor Data-tab inspector for the `entities` catalog and is the shape
 * {@link entityEntryFromCatalog} reads. A game exports it as an `editorCatalogs` schema; the scaffold
 * ships a starter one so the tab is never empty.
 * @capability editor-entities Author entity stats/movement per catalog row instead of hardcoding TS.
 */
export const entityDefinitionSchema: ParamSchema = {
  fields: [
    {
      key: "role",
      type: "select",
      label: "Role",
      default: "enemy",
      options: ENTITY_ROLES.map((role) => ({ value: role })),
    },
    { key: "maxHealth", type: "number", label: "Max health", default: 20, min: 1, max: 100000, step: 1 },
    { key: "walkSpeed", type: "range", label: "Walk speed", default: 3, min: 0, max: 20, step: 0.1, unit: "m/s" },
    { key: "scale", type: "range", label: "Scale", default: 1, min: 0.1, max: 10, step: 0.1 },
  ],
};

/** Minimal document shape {@link entityEntryFromCatalog} reads — any `EditorDocument` satisfies it. */
export interface EntityCatalogDocumentLike {
  catalogs: readonly EditorCatalogData[];
}

function entityCatalogDefinition(
  definitions: readonly EditorCatalogDefinition[] | undefined,
): EditorCatalogDefinition | undefined {
  return definitions?.find((definition) => definition.id === ENTITY_CATALOG_ID);
}

/**
 * Resolves the merged `meta` for one entity row: game-exported defaults (from `definitions`, if
 * given) overlaid by the values persisted on the scene document. Returns `undefined` when neither
 * source carries the row, so callers can distinguish "no such entity" from "default entity".
 */
function mergedEntityMeta(
  document: EntityCatalogDocumentLike,
  entityId: string,
  definitions?: readonly EditorCatalogDefinition[],
): Record<string, unknown> | undefined {
  const defaultEntry = entityCatalogDefinition(definitions)?.entries.find((entry) => entry.id === entityId);
  const authored = document.catalogs
    .find((catalog) => catalog.id === ENTITY_CATALOG_ID)
    ?.entries.find((entry) => entry.id === entityId);
  if (defaultEntry === undefined && authored === undefined) return undefined;
  return { ...defaultEntry?.meta, ...authored?.meta };
}

/**
 * Turns an authored entity row into the runtime {@link GameContextEntityEntry} a spawn consumes:
 * looks up `entityId` in the document's {@link ENTITY_CATALOG_ID} catalog (falling back to the
 * game-exported `definitions` defaults), parses it against {@link entityDefinitionSchema}, and maps
 * the fields onto stats/movement/role. Returns `null` when no row defines the entity, so the default
 * `content.ts` path can chain other resolvers. The single seam that makes "place a mob, tune its
 * stats/speed in the editor, save — it spawns with those stats" work with zero game code.
 * @capability editor-entities Consume authored entity definitions from the scene document at runtime.
 */
export function entityEntryFromCatalog(
  document: EntityCatalogDocumentLike,
  entityId: string,
  definitions?: readonly EditorCatalogDefinition[],
): GameContextEntityEntry | null {
  const meta = mergedEntityMeta(document, entityId, definitions);
  if (meta === undefined) return null;
  const params = parseParams(entityDefinitionSchema, meta);
  const role = params.role as CatalogEntityRole;
  const maxHealth = params.maxHealth as number;
  const walkSpeed = params.walkSpeed as number;
  const scale = params.scale as number;
  const entry: GameContextEntityEntry = {
    role,
    stats: { health: { max: maxHealth, min: 0 } },
    receive: { damage: { order: ["health"] } },
    movement: { walkSpeed },
  };
  if (scale !== 1) entry.scale = scale;
  return entry;
}
