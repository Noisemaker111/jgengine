import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { ModelConfig } from "@jgengine/core/game/playableGame";

export interface ModelResolveContext {
  seam: "entityModels" | "objectModels" | "scatterModels";
  key: string;
}

/**
 * Resolve a string asset id or a direct ModelConfig. Missing/misspelled catalog
 * ids throw — silent generic-primitive fallback only happens when the mapping
 * omits the key entirely (or uses tryResolveCatalogModel for optional ids).
 */
export function resolveModel(
  value: string | ModelConfig | undefined,
  assets: AssetCatalog,
  context?: ModelResolveContext,
): ModelConfig | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return value;
  const ref = assets.resolve(value);
  if (ref === null) {
    const where =
      context === undefined ? `model asset "${value}"` : `${context.seam}["${context.key}"] → "${value}"`;
    throw new Error(
      `[jgengine] missing ${where} — not in the asset catalog. Fix the id, register it, or omit the mapping to keep the deliberate primitive/sprite fallback.`,
    );
  }
  return ref.dims === undefined ? { url: ref.url } : { url: ref.url, dims: ref.dims };
}

/** Soft lookup used when an object catalog id may double as a model asset id. */
export function tryResolveCatalogModel(id: string, assets: AssetCatalog): ModelConfig | undefined {
  const ref = assets.resolve(id);
  if (ref === null) return undefined;
  return ref.dims === undefined ? { url: ref.url } : { url: ref.url, dims: ref.dims };
}

/**
 * Preferred + optional fallback catalog ids for a single entity/object slot.
 * Soft-resolves through the catalog: when neither id is live (pack not pulled/
 * reindexed yet), the mapping is omitted and the shell keeps its primitive.
 * Re-home later by fixing ids / pulling packs — no Kenney, no hard throws.
 */
export type ModelPick = {
  model?: string;
  fallbackModel?: string;
  style?: Omit<ModelConfig, "url" | "dims">;
};

/** Soft-resolve `model`, then `fallbackModel`; merge `style` when either hits. */
export function pickModel(assets: AssetCatalog, pick: ModelPick): ModelConfig | undefined {
  for (const id of [pick.model, pick.fallbackModel]) {
    if (id === undefined) continue;
    const resolved = tryResolveCatalogModel(id, assets);
    if (resolved === undefined) continue;
    return pick.style === undefined ? resolved : { ...resolved, ...pick.style };
  }
  return undefined;
}

/** Build an entityModels/objectModels map from a plan; missing catalog ids drop out (primitive). */
export function resolveModelPlan(
  assets: AssetCatalog,
  plan: Record<string, ModelPick>,
): Record<string, ModelConfig> {
  const out: Record<string, ModelConfig> = {};
  for (const [key, pick] of Object.entries(plan)) {
    const model = pickModel(assets, pick);
    if (model !== undefined) out[key] = model;
  }
  return out;
}

/**
 * Builds a `(key) => ModelConfig | null` override from a `seam`'s id/config map plus its catalog —
 * `undefined` when either half is missing so the caller can fall back to its own default renderer.
 * An unmapped key resolves to `null` (deliberate fallback); a mapped key with a missing/misspelled
 * catalog id throws via {@link resolveModel}, same as the `entityModels`/`objectModels` seams.
 */
export function createModelMapResolver(
  map: Record<string, string | ModelConfig> | undefined,
  assets: AssetCatalog | undefined,
  seam: ModelResolveContext["seam"],
): ((key: string) => ModelConfig | null) | undefined {
  if (map === undefined || assets === undefined) return undefined;
  return (key: string): ModelConfig | null => {
    const mapped = map[key];
    if (mapped === undefined) return null;
    return resolveModel(mapped, assets, { seam, key }) ?? null;
  };
}
