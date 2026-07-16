import type { EditorCatalogDefinition } from "@jgengine/core/editor/index";
import type { ParamSchema } from "@jgengine/core/scene/sceneKinds";

import { TOWER_CATALOG, TOWER_IDS } from "./game/entities/towers/catalog";

/** Tunable tower combat/economy fields — drives the editor Data panel via SchemaInspector. */
export const TOWER_SCHEMA: ParamSchema = {
  fields: [
    { key: "cost", type: "number", default: 50, min: 0, max: 500, step: 5, label: "Cost" },
    { key: "range", type: "range", default: 7, min: 1, max: 20, step: 0.5, label: "Range", unit: "m" },
    { key: "damage", type: "number", default: 8, min: 0, max: 200, step: 1, label: "Damage" },
    { key: "fireRateHz", type: "range", default: 1, min: 0.1, max: 10, step: 0.1, label: "Fire rate", unit: "Hz" },
    { key: "splashRadius", type: "range", default: 0, min: 0, max: 8, step: 0.1, label: "Splash", unit: "m" },
  ],
};

/**
 * Gameplay data catalogs for the scene editor — schemas stay in code; entry values seed
 * `document.catalogs` and are what agents/designers edit via list/get/set_catalog_entry.
 */
export const editorCatalogs: readonly EditorCatalogDefinition[] = [
  {
    id: "towers",
    label: "Towers",
    schema: TOWER_SCHEMA,
    entries: TOWER_IDS.map((id) => {
      const def = TOWER_CATALOG[id]!;
      return {
        id: def.id,
        label: def.label,
        meta: {
          cost: def.cost,
          range: def.range,
          damage: def.damage,
          fireRateHz: def.fireRateHz,
          splashRadius: def.splashRadius,
        },
      };
    }),
  },
];
