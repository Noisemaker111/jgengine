import type { LodBand } from "./lod";
import { lodBandIndex } from "./lod";

/** How a model, or one of its variant levels, takes part in the shadow pass. */
export type ModelShadowMode = "cast" | "receive" | "both" | "none";

/** One mesh level of a {@link ModelVariantLodConfig}: a full or decimated GLB, how far it draws and how it shadows. */
export interface ModelVariantConfig {
  /** GLB url for this level — the source asset for the near level, a decimated asset for the far ones. */
  url: string;
  /** Furthest distance in metres from the camera this level draws. The last level omits it and covers everything beyond the level before it. */
  maxDistance?: number;
  /**
   * This level's shadow participation. `"inherit"` (the default) keeps the model's own `shadows`, so a
   * level that says nothing draws exactly as it did before levels could choose. A far level set to
   * `"none"` leaves the shadow pass entirely while still drawing its mesh.
   */
  shadows?: ModelShadowMode | "inherit";
}

/**
 * Ordered mesh detail levels for one model, switched per instance by camera distance. The first level
 * is the full mesh the model's own `url` names; every later level is a cheaper asset. A tree line uses
 * this so near trees keep their full mesh while far ones draw a decimated copy of the same species.
 */
export interface ModelVariantLodConfig {
  /** Levels ordered near to far; the first covers everything up to its `maxDistance`. Two or more. */
  levels: readonly ModelVariantConfig[];
  /** Metres an instance must travel past a switch boundary before it changes level, so a camera resting on the boundary cannot flicker. Default 6. */
  hysteresis?: number;
}

/** Plain JSON state of a {@link ModelVariantSelector}: each id's current level index. */
export interface ModelVariantSelectorState {
  levels: Record<string, number>;
}

/** Per-instance distance switch over a model's detail levels: one answer per id, held across a boundary until the instance clears it. */
export interface ModelVariantSelector {
  /** Levels near to far, with the last level's `maxDistance` normalized to `Infinity`. */
  levels(): readonly { url: string; maxDistance: number }[];
  /** The same boundaries as scheduler bands, so a `createLodScheduler` never throttles an id at a different distance than its mesh switches. */
  bands(): readonly LodBand[];
  /** Level index for `id` at `distance` metres, carrying hysteresis from its previous answer. */
  level(id: string, distance: number): number;
  forget(id: string): void;
  clear(): void;
  size(): number;
  snapshot(): ModelVariantSelectorState;
  restore(next: ModelVariantSelectorState): void;
}

/** Metres an instance must travel past a switch boundary before it changes level unless the model declares its own. */
export const DEFAULT_VARIANT_HYSTERESIS = 6;

function normalize(config: ModelVariantLodConfig): readonly { url: string; maxDistance: number }[] {
  if (!Array.isArray(config.levels) || config.levels.length < 2) {
    throw new Error("Model variants need at least two levels: the full mesh and a cheaper one");
  }
  let previous = 0;
  return config.levels.map((level, index) => {
    if (typeof level.url !== "string" || level.url.length === 0) {
      throw new Error(`Model variant level ${index} needs a url`);
    }
    const last = index === config.levels.length - 1;
    const maxDistance = level.maxDistance;
    if (last) {
      if (maxDistance !== undefined && maxDistance !== Infinity) {
        throw new Error("The last model variant level draws at every distance; leave its maxDistance undefined");
      }
      return { url: level.url, maxDistance: Infinity };
    }
    if (typeof maxDistance !== "number" || !Number.isFinite(maxDistance) || maxDistance <= previous) {
      throw new Error(`Model variant level ${index} needs a finite maxDistance above the level before it`);
    }
    previous = maxDistance;
    return { url: level.url, maxDistance };
  });
}

/** Builds the per-instance distance switch for a model's variant levels. */
export function createModelVariantSelector(config: ModelVariantLodConfig): ModelVariantSelector {
  const levels = normalize(config);
  const hysteresis = Math.max(0, config.hysteresis ?? DEFAULT_VARIANT_HYSTERESIS);
  const bands: readonly LodBand[] = levels.map((level) => ({ maxDistance: level.maxDistance, interval: 0 }));
  const current = new Map<string, number>();
  const last = levels.length - 1;

  return {
    levels() {
      return levels;
    },
    bands() {
      return bands;
    },
    level(id, distance) {
      let index = current.get(id);
      if (index === undefined) {
        const band = lodBandIndex(bands, distance);
        index = band === -1 ? last : band;
      }
      else {
        while (index < last && distance > levels[index]!.maxDistance + hysteresis) index += 1;
        while (index > 0 && distance <= levels[index - 1]!.maxDistance - hysteresis) index -= 1;
      }
      current.set(id, index);
      return index;
    },
    forget(id) {
      current.delete(id);
    },
    clear() {
      current.clear();
    },
    size() {
      return current.size;
    },
    snapshot() {
      return { levels: Object.fromEntries(current) };
    },
    restore(next) {
      current.clear();
      for (const [id, index] of Object.entries(next.levels)) current.set(id, index);
    },
  };
}
