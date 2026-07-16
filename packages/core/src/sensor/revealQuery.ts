import { distanceBetween } from "../scene/spatial";
import type { EntityPosition } from "../scene/entityStore";

export interface RevealHit {
  instanceId: string;
  distance: number;
  tags: readonly string[];
}

export interface RevealQueryOptions {
  resolvePosition: (instanceId: string) => EntityPosition | undefined;
  resolveTags: (instanceId: string) => readonly string[];
  candidates: () => string[];
}

export interface RevealQuery {
  inRadius(center: EntityPosition | string, radius: number, tags: readonly string[]): RevealHit[];
}

/**
 * `inRadius` already ignores occlusion; combat's AoE resolution is what layers a
 * line-of-sight filter on top of it (see `effect({ at, radius, los })`). This is
 * the same unfiltered radius query, scoped to catalog-declared tags and shaped
 * for a vision readout (Dark Sight / detective-vision reveal) instead of damage
 * resolution — it never consults an occluder, by design.
  * @internal
  */
export function createRevealQuery(options: RevealQueryOptions): RevealQuery {
  const { resolvePosition, resolveTags, candidates } = options;

  return {
    inRadius(center, radius, tags) {
      const centerId = typeof center === "string" ? center : null;
      const centerPosition = typeof center === "string" ? resolvePosition(center) : center;
      if (centerPosition === undefined) return [];
      const hits: RevealHit[] = [];
      for (const instanceId of candidates()) {
        if (instanceId === centerId) continue;
        const position = resolvePosition(instanceId);
        if (position === undefined) continue;
        const distance = distanceBetween(centerPosition, position);
        if (distance > radius) continue;
        const entityTags = resolveTags(instanceId);
        if (tags.length > 0 && !tags.some((tag) => entityTags.includes(tag))) continue;
        hits.push({ instanceId, distance, tags: entityTags });
      }
      hits.sort((a, b) => a.distance - b.distance);
      return hits;
    },
  };
}
