import {
  ENTITY_CATALOG_ID,
  entityDefinitionSchema,
  type EditorCatalogDefinition,
} from "@jgengine/core/editor/index";

import { COMBATANTS } from "./game/catalog";

/**
 * Surfaces the roster in the editor Data tab (F2+E → Data) so a designer can see and retune each
 * type's role/health/speed/scale. The combat numbers the schema can't model (damage/reach/aggro)
 * live in `game/catalog.ts`, which is the single source this projection reads from.
 */
export const editorCatalogs: readonly EditorCatalogDefinition[] = [
  {
    id: ENTITY_CATALOG_ID,
    label: "Roster",
    schema: entityDefinitionSchema,
    entries: Object.values(COMBATANTS).map((def) => ({
      id: def.id,
      label: def.label,
      meta: { role: def.role, maxHealth: def.maxHealth, walkSpeed: def.walkSpeed, scale: def.scale },
    })),
  },
];
