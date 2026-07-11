import type { AssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { ModelConfig } from "@jgengine/core/game/playableGame";

export interface ModelResolveContext {
  seam: "entityModels" | "objectModels";
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
