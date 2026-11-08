/**
 * Same-image shadow caching, the renderer-agnostic half: what one light's depth pass draws this frame.
 *
 * A light that re-renders its map at an unchanged projection keeps a static layer: the depth of every
 * caster that has not changed, drawn once at that projection. Each frame the map starts as a copy of
 * that layer and only the changed casters draw over it with the depth test on. Depth is the minimum
 * over every fragment, so the map is bit-identical to drawing every caster again.
 */

/** What a light's depth pass does this frame. */
export type ShadowPassPlan =
  /** Draw every caster, as three does without a cache. */
  | "full"
  /** Draw the static casters into the layer, then copy it into the map and draw the changed casters over it. */
  | "rebuild"
  /** Copy the layer into the map and draw the changed casters over it. */
  | "reuse"
  /** The map already holds exactly the layer and no changed caster reaches it: draw nothing. */
  | "hold";

/** One light's cache bookkeeping. @internal */
export interface ShadowLayerState {
  /** Projection key the map was last drawn with; null before its first pass. */
  drawnKey: number[] | null;
  /**
   * The light's last pass was at the key of the pass before it. A light that just held still is
   * worth a layer when its key moves; one whose key moves every pass (the cascade around a walking
   * camera) would rebuild a layer it never reuses, so it draws full until it holds again.
   */
  cacheable: boolean;
  /** Key the static layer was drawn at; null while there is none. */
  layerKey: number[] | null;
  /** A static caster this light's layer can see changed since the layer was drawn. */
  layerStale: boolean;
  /** The map holds the layer alone, with no changed caster drawn over it. */
  mapIsLayer: boolean;
}

/** @internal */
export function createShadowLayerState(): ShadowLayerState {
  return { drawnKey: null, cacheable: false, layerKey: null, layerStale: false, mapIsLayer: false };
}

/** Exact equality of two projection keys. @internal */
export function sameShadowKey(a: readonly number[] | null, b: readonly number[]): boolean {
  if (a === null || a.length !== b.length) return false;
  for (let index = 0; index < b.length; index += 1) if (a[index] !== b[index]) return false;
  return true;
}

/**
 * The pass for a light asked to redraw at `key`. A light whose redraws keep coming with a new
 * projection (a far cascade stepping a texel, the near one while walking) stays on `full`: a layer
 * would never be reused.
 * @internal
 */
export function planShadowPass(state: ShadowLayerState, key: readonly number[], changedCastersReach: boolean): ShadowPassPlan {
  const held = sameShadowKey(state.drawnKey, key);
  if (!state.cacheable && !held) return "full";
  const layerFresh = !state.layerStale && sameShadowKey(state.layerKey, key);
  if (!layerFresh) return "rebuild";
  if (held && state.mapIsLayer && !changedCastersReach) return "hold";
  return "reuse";
}

/** Record the pass that ran, so the next frame plans from what the map and layer now hold. @internal */
export function recordShadowPass(state: ShadowLayerState, key: readonly number[], plan: ShadowPassPlan, changedCastersReach: boolean): void {
  state.cacheable = sameShadowKey(state.drawnKey, key);
  if (plan === "full") {
    state.mapIsLayer = false;
  } else {
    if (plan === "rebuild") {
      state.layerKey = [...key];
      state.layerStale = false;
    }
    state.mapIsLayer = !changedCastersReach;
  }
  if (state.drawnKey === null || state.drawnKey.length !== key.length) state.drawnKey = [...key];
  else for (let index = 0; index < key.length; index += 1) state.drawnKey[index] = key[index]!;
}

/** Forget the layer, e.g. after the device lost it or the shadow type changed. @internal */
export function dropShadowLayer(state: ShadowLayerState): void {
  state.layerKey = null;
  state.layerStale = false;
  state.mapIsLayer = false;
}
