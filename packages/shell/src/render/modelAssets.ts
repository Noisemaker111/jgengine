import type { ModelConfig, ModelMaterialMaps } from "@jgengine/core/game/playableGame";

/** Stable loader keys shared by preloading and material application. @internal */
export function modelMapEntries(maps: ModelMaterialMaps): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const key of ["color", "normal", "roughness", "ao", "metalness", "emissive", "height"] as const) {
    if (maps[key] !== undefined) entries[key] = maps[key];
  }
  return entries;
}

/** Start composed model dependencies together instead of discovering them after each parent commits. @internal */
export function modelAssetRequests(model: ModelConfig): { models: string[]; textureGroups: string[][] } {
  const models = new Set<string>();
  const textureGroups = new Map<string, string[]>();
  const visited = new Set<ModelConfig>();
  const visit = (next: ModelConfig) => {
    if (visited.has(next)) return;
    visited.add(next);
    models.add(next.url);
    if (next.material?.maps !== undefined) {
      const urls = Object.values(modelMapEntries(next.material.maps));
      if (urls.length > 0) textureGroups.set(JSON.stringify(urls), urls);
    }
    for (const child of [...(next.parts ?? []), ...(next.attachments ?? [])]) {
      if (typeof child.model !== "string") visit(child.model);
    }
  };
  visit(model);
  return { models: [...models], textureGroups: [...textureGroups.values()] };
}
