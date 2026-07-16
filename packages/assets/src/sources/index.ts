import type { AssetSource } from "../manifest";
import { ambientcgSources } from "./ambientcg";
import { gameiconsSources } from "./gameicons";
import { kaykitSources } from "./kaykit";
import { quaterniusSources } from "./quaternius";

export const sources: readonly AssetSource[] = [
  ...quaterniusSources,
  ...kaykitSources,
  ...ambientcgSources,
  ...gameiconsSources,
];

/** Every source whose archive holds GLB models (Quaternius, KayKit packs). */
export const modelSources: readonly AssetSource[] = sources.filter(
  (source) => (source.kind ?? "model") === "model",
);

/** Every `kind: "material"` source — one CC0 PBR material each, resolvable via `buildMaterialCatalog`. */
export const materialSources: readonly AssetSource[] = sources.filter(
  (source) => source.kind === "material",
);

/** Every `kind: "sprite"` source — a pack of individual 2D icon/UI files, resolvable via `buildSpriteCatalog`. */
export const spriteSources: readonly AssetSource[] = sources.filter(
  (source) => source.kind === "sprite",
);

export const sourceById: ReadonlyMap<string, AssetSource> = new Map(
  sources.map((source) => [source.id, source]),
);

export { ambientcgSources, gameiconsSources, kaykitSources, quaterniusSources };
