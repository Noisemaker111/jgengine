import type { AssetSource } from "../manifest";
import { ambientcgSources } from "./ambientcg";
import { kaykitSources } from "./kaykit";
import { kenneySources } from "./kenney";
import { quaterniusSources } from "./quaternius";

export const sources: readonly AssetSource[] = [
  ...kenneySources,
  ...quaterniusSources,
  ...kaykitSources,
  ...ambientcgSources,
];

/** Every source whose archive holds GLB models (Kenney, Quaternius, KayKit packs). */
export const modelSources: readonly AssetSource[] = sources.filter(
  (source) => (source.kind ?? "model") === "model",
);

/** Every `kind: "material"` source — one CC0 PBR material each, resolvable via `buildMaterialCatalog`. */
export const materialSources: readonly AssetSource[] = sources.filter(
  (source) => source.kind === "material",
);

export const sourceById: ReadonlyMap<string, AssetSource> = new Map(
  sources.map((source) => [source.id, source]),
);

export { ambientcgSources, kaykitSources, kenneySources, quaterniusSources };
