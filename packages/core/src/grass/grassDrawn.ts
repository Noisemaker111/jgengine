import type { GrassLook } from "@jgengine/core/grass/grassKind";
import { grassDetailScale, grassExaggerationAmount } from "@jgengine/core/grass/grassStyle";

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * How mown a look reads, 0..1: short blades cut to an even height (a lawn, a green, a pitch). The
 * natural end of `exaggeration` keeps a mown look's heights even and ends its blades blunt and torn,
 * where an unmown look grows irregular lengths with pointed tips.
 */
export function grassMownAmount(look: Pick<GrassLook, "blade">): number {
  return (1 - smoothstep(0.15, 0.3, look.blade.heightVariation)) * (1 - smoothstep(0.12, 0.25, look.blade.bladeHeight));
}

/**
 * The blades a look's style draws. `detail` trades blade count for width (`grassDetailScale`) and
 * groups the extra blades partly into fuller tufts, partly into more tufts; blade count follows width
 * through `grassBladeDensity`, so the ground covered stays the same. `exaggeration` evens heights,
 * widths and deepens curls toward the cartoon end, and grows irregular lengths toward the natural end
 * (mown looks stay even: their tips are cut). Flower share follows the tuft count, so flowers per m²
 * hold. At the default style this is the look itself.
 *
 * The bake (`resolveGrassBake`) and the generator draw from this; the look itself stays what grows.
 */
export function drawnGrassLook(look: GrassLook): GrassLook {
  const scale = grassDetailScale(look.style.detail);
  const amount = grassExaggerationAmount(look.style.exaggeration);
  if (scale === 1 && amount === 0) return look;
  const blade = { ...look.blade };
  const tuft = { ...look.tuft };
  if (scale !== 1) {
    blade.bladeWidth = look.blade.bladeWidth / scale;
    tuft.tuftBlades = Math.max(1, Math.round(look.tuft.tuftBlades * Math.sqrt(scale)));
  }
  // Heads ride one per flowering tuft; as detail changes the number of tufts, the share follows, so
  // flowers per square metre stay the species' own.
  const tuftsPerTuft = scale / (tuft.tuftBlades / look.tuft.tuftBlades);
  const flowers = scale === 1 ? look.flowers : { ...look.flowers, flowerShare: Math.min(1, look.flowers.flowerShare / tuftsPerTuft) };
  if (amount > 0) {
    blade.heightVariation = look.blade.heightVariation * (1 - amount);
    blade.widthVariation = look.blade.widthVariation * (1 - amount);
    blade.curvature = Math.min(1, look.blade.curvature * (1 + 0.8 * amount) + 0.15 * amount);
  } else if (amount < 0) {
    blade.heightVariation = look.blade.heightVariation + (1 - look.blade.heightVariation) * -amount * 0.5 * (1 - grassMownAmount(look));
  }
  return { ...look, blade, tuft, flowers };
}
