/**
 * Same-image shadow caching, the renderer-agnostic half: what one light's depth pass draws this frame.
 *
 * A light that re-renders its map at an unchanged projection keeps a static layer: the depth of every
 * caster that has not changed, drawn once at that projection. Each frame the map starts as a copy of
 * that layer and only the changed casters draw over it with the depth test on. Depth is the minimum
 * over every fragment, so the map is bit-identical to drawing every caster again.
 */

export type ShadowPassPlan =
  | "full"
  /** Draw the static casters into the layer, then copy it into the map and draw the changed casters over it. */
  | "rebuild"
  /** Copy the layer into the map and draw the changed casters over it. */
  | "reuse"
  /** The map already holds exactly the layer and no changed caster reaches it: draw nothing. */
  | "hold";

/** @internal */
export interface ShadowLayerState {
  drawnKey: number[] | null;
  /** Passes in a row drawn at `drawnKey` after the one that moved to it. */
  heldPasses: number;
  /**
   * Held passes in a row before a layer is built. A rebuild costs a full draw plus a copy, so it pays
   * only if the key then holds for at least one more pass: a camera that moves on some frames and not
   * others (an uncapped frame rate over a fixed simulation step) would rebuild a layer every few
   * frames and never use it. Each layer that goes unused before the key moves raises this by one;
   * each that serves a pass lowers it, down to 1.
   */
  rebuildAfter: number;
  layerUnproven: boolean;
  layerKey: number[] | null;
  layerStale: boolean;
  mapIsLayer: boolean;
}

/** @internal */
export function createShadowLayerState(): ShadowLayerState {
  return { drawnKey: null, heldPasses: 0, rebuildAfter: 1, layerUnproven: false, layerKey: null, layerStale: false, mapIsLayer: false };
}

/** @internal */
export function sameShadowKey(a: readonly number[] | null, b: readonly number[]): boolean {
  if (a === null || a.length !== b.length) return false;
  for (let index = 0; index < b.length; index += 1) if (a[index] !== b[index]) return false;
  return true;
}

const MAX_REBUILD_AFTER = 8;

/** @internal */
export function shadowPassMayCache(state: ShadowLayerState, key: readonly number[]): boolean {
  return sameShadowKey(state.drawnKey, key) || (!state.layerStale && sameShadowKey(state.layerKey, key));
}

/**
 * The pass for a light asked to redraw at `key`. A pass at a new projection (a far cascade stepping a
 * texel, the near one while walking) draws in full; a layer is built once the key has held for
 * {@link ShadowLayerState.rebuildAfter} passes.
 * @internal
 */
export function planShadowPass(state: ShadowLayerState, key: readonly number[], changedCastersReach: boolean): ShadowPassPlan {
  const held = sameShadowKey(state.drawnKey, key);
  if (!state.layerStale && sameShadowKey(state.layerKey, key)) return held && state.mapIsLayer && !changedCastersReach ? "hold" : "reuse";
  if (!held) return "full";
  return state.heldPasses + 1 >= state.rebuildAfter ? "rebuild" : "full";
}

/** Record the pass that ran, so the next frame plans from what the map and layer now hold. @internal */
export function recordShadowPass(state: ShadowLayerState, key: readonly number[], plan: ShadowPassPlan, changedCastersReach: boolean): void {
  if (sameShadowKey(state.drawnKey, key)) {
    state.heldPasses += 1;
  } else {
    state.heldPasses = 0;
    // The key moved on before the last layer served a pass: wait one held pass longer next time.
    if (state.layerUnproven) state.rebuildAfter = Math.min(MAX_REBUILD_AFTER, state.rebuildAfter + 1);
    state.layerUnproven = false;
  }
  if (plan === "full") {
    state.mapIsLayer = false;
  } else {
    if (plan === "rebuild") {
      // A layer rebuilt before the last one served a pass (a static caster in reach changed) was wasted too.
      if (state.layerUnproven) state.rebuildAfter = Math.min(MAX_REBUILD_AFTER, state.rebuildAfter + 1);
      state.layerKey = [...key];
      state.layerStale = false;
      state.layerUnproven = true;
    } else if (state.layerUnproven) {
      state.layerUnproven = false;
      state.rebuildAfter = Math.max(1, state.rebuildAfter - 1);
    }
    state.mapIsLayer = !changedCastersReach;
  }
  if (state.drawnKey === null || state.drawnKey.length !== key.length) state.drawnKey = [...key];
  else for (let index = 0; index < key.length; index += 1) state.drawnKey[index] = key[index]!;
}

/** Forget the layer, e.g. after the device lost it or the shadow type changed. @internal */
export function dropShadowLayer(state: ShadowLayerState): void {
  state.layerKey = null;
  state.layerUnproven = false;
  state.layerStale = false;
  state.mapIsLayer = false;
}
