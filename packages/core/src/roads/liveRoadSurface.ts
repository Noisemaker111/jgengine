import type { LiveRoadSource, RoadEnvironmentDescriptor, RoadSurfaceScans } from "../world/features";

/** A {@link LiveRoadSource} whose carriageway surface can be swapped at runtime. */
export interface SurfaceSwappableRoadSource extends LiveRoadSource {
  /** Pick the layers drawn over each road's own; `undefined` restores the roads as authored. Redraws only when the choice changes. */
  setSurface(layers: Partial<RoadSurfaceScans> | undefined): void;
}

/**
 * Wrap a road source so a game can change what its streets are made of while it runs: wet asphalt
 * after dusk, snow over winter, a painted event route. The base source stays the authority on the
 * roads' shape; only the named scan layers are replaced, and a layer left out keeps its own.
 *
 * @capability live-road-surface swap a road source's asphalt, sidewalk or kerb scan at runtime (wet at night, snow in winter)
 */
export function withSwappableRoadSurface(base: LiveRoadSource): SurfaceSwappableRoadSource {
  const listeners = new Set<() => void>();
  let layers: Partial<RoadSurfaceScans> | undefined;
  let source: readonly RoadEnvironmentDescriptor[] | undefined;
  let mapped: readonly RoadEnvironmentDescriptor[] = [];
  const notify = (): void => {
    for (const listener of [...listeners]) listener();
  };
  return {
    current() {
      const roads = base.current();
      if (layers === undefined) return roads;
      if (roads !== source) {
        source = roads;
        const swap = layers;
        mapped = roads.map((road) => ({ ...road, materials: { ...road.materials, ...swap } }));
      }
      return mapped;
    },
    subscribe(listener) {
      listeners.add(listener);
      const stopBase = base.subscribe(() => {
        source = undefined;
        listener();
      });
      return () => {
        listeners.delete(listener);
        stopBase();
      };
    },
    setSurface(next) {
      if (next === layers) return;
      layers = next;
      source = undefined;
      notify();
    },
  };
}
