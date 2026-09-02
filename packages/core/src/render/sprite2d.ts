import type { SpriteAtlas } from "../assets/spriteAtlas";

/** Serializable playback position for a named sprite animation. */
export interface SpriteClipState { animation: string; frameIndex: number; elapsed: number; done: boolean }

/** Create a renderer-independent sprite animation player.
 * @capability sprite-2d animate a sprite atlas clip from headless or rendered game code
 */
export function createSpriteClipPlayer(atlas: SpriteAtlas) {
  let state: SpriteClipState = { animation: Object.keys(atlas.animations)[0] ?? "", frameIndex: 0, elapsed: 0, done: false };
  let speed = 1;
  const current = () => { const animation = atlas.animations[state.animation]; if (!animation) return undefined; return atlas.frames[animation.frames[state.frameIndex]]; };
  return {
    play(name: string) { if (!atlas.animations[name]) throw new Error(`Unknown sprite animation: ${name}.`); state = { animation: name, frameIndex: 0, elapsed: 0, done: false }; },
    advance(dt: number) { if (!Number.isFinite(dt) || dt < 0) throw new Error("dt must be non-negative."); const animation = atlas.animations[state.animation]; if (!animation || state.done) return; state.elapsed += dt * speed; const duration = 1 / animation.fps; while (state.elapsed >= duration && !state.done) { state.elapsed -= duration; if (state.frameIndex + 1 < animation.frames.length) state.frameIndex += 1; else if (animation.loop === false) { state.frameIndex = animation.frames.length - 1; state.done = true; } else state.frameIndex = 0; } },
    frame: current,
    snapshot: () => ({ ...state }),
    restore(next: SpriteClipState) { if (!atlas.animations[next.animation]) throw new Error(`Unknown sprite animation: ${next.animation}.`); state = { ...next }; },
    retune(next: { speed: number }) { if (!Number.isFinite(next.speed) || next.speed < 0) throw new Error("speed must be non-negative."); speed = next.speed; },
  };
}

/** Canonical layers used by 2D presentations. */
export const SortingLayers = ["background", "world", "actors", "effects", "foreground", "ui"] as const;
/** Resolve a layer name and local offset into a stable render order.
 * @capability sprite-2d order sprites by named presentation layers
 */
export function sortingOrder(layers: readonly string[], layer: string, offset = 0): number { const index = layers.indexOf(layer); if (index < 0) throw new Error(`Unknown sorting layer: ${layer}.`); if (!Number.isFinite(offset)) throw new Error("offset must be finite."); return index + offset; }
