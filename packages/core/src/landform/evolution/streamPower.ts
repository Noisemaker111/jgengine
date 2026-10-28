// @skill jgengine-world
/**
 * Detachment-limited river incision by the stream-power law, ∂z/∂t = −K A^m S^n (Howard & Kerby
 * 1983; Whipple & Tucker 1999), solved implicitly in one pass down the flow stack (Braun & Willett
 * 2013). Each cell's new height depends only on its receiver's new height, which the stack has
 * already set, so the solve is O(n) and stable at any time step. For n = 1 the update is closed form;
 * otherwise a safeguarded Newton iteration finds it.
 *
 * @capability landform-evolution grow a heightfield from uplift, river incision, hillslopes, landslides, sediment and rock strata
 */
import { plantPow } from "../../plants/growth/plantMath";
import type { FlowRouting } from "../flow/flowRouting";

/** One implicit stream-power update's inputs. @internal */
export interface IncisionInput {
  height: Float64Array;
  routing: FlowRouting;
  /** 1 where a cell lies under standing water (a lake or the sea): no incision there. */
  wet: Uint8Array;
  /** 1 where glacier ice covers the bed: no river incision there. Default none. */
  shielded?: Uint8Array;
  /** Bedrock K per cell, its rock layer applied. */
  erodibility: Float64Array;
  /** K of loose sediment. */
  looseErodibility: number;
  /** Loose sediment thickness per cell in metres, cut at the loose K before the rock beneath. */
  sediment: Float64Array;
  areaExponent: number;
  slopeExponent: number;
  dt: number;
  /** Receives the thickness each cell lost, in metres. */
  erosion: Float64Array;
}

const NEWTON_STEPS = 40;
const NEWTON_TOLERANCE = 1e-10;

function areaTerm(area: number, m: number): number {
  return m === 0.5 ? Math.sqrt(area) : plantPow(area, m);
}

/** Solve x − h + G (x − t)^n = 0 for x in (t, h]. @internal */
export function solveIncision(h: number, target: number, g: number, n: number): number {
  if (n === 1) return (h + g * target) / (1 + g);
  let lo = target;
  let hi = h;
  let x = h;
  for (let k = 0; k < NEWTON_STEPS; k += 1) {
    const drop = x - target;
    const f = x - h + g * plantPow(drop, n);
    if (f > 0) hi = x;
    else lo = x;
    const slope = 1 + n * g * plantPow(drop, n - 1);
    let next = x - f / slope;
    if (!(next > lo && next < hi)) next = 0.5 * (lo + hi);
    if (Math.abs(next - x) <= NEWTON_TOLERANCE * (1 + Math.abs(x))) return next;
    x = next;
  }
  return x;
}

/** Run one implicit stream-power update down the stack. @internal */
export function incise(input: IncisionInput): void {
  const { height, routing, wet, shielded, erodibility, looseErodibility, sediment, areaExponent, slopeExponent, dt, erosion } = input;
  const { stack, receiver, receiverDistance, area, water } = routing;
  erosion.fill(0);
  for (let s = 0; s < stack.length; s += 1) {
    const i = stack[s] ?? 0;
    const r = receiver[i] ?? i;
    if (r === i || wet[i] === 1 || shielded?.[i] === 1) continue;
    // A river entering a lake or the sea cuts down to the water surface, not the drowned floor.
    const target = wet[r] === 1 ? (water[r] ?? 0) : (height[r] ?? 0);
    const h = height[i] ?? 0;
    if (h <= target) continue;
    const run = receiverDistance[i] ?? 1;
    const power = areaTerm(area[i] ?? 0, areaExponent) / (slopeExponent === 1 ? run : plantPow(run, slopeExponent));
    const cover = sediment[i] ?? 0;
    let top = h;
    let remaining = dt;
    if (cover > 0 && looseErodibility > 0) {
      const loose = solveIncision(h, target, looseErodibility * dt * power, slopeExponent);
      if (h - loose <= cover) {
        erosion[i] = h - loose;
        height[i] = loose;
        continue;
      }
      // The cover is gone part way through the step; the rest of the step cuts rock.
      remaining = dt * (1 - cover / (h - loose));
      top = h - cover;
    }
    const k = erodibility[i] ?? 0;
    const next = k > 0 && remaining > 0 && top > target ? solveIncision(top, target, k * remaining * power, slopeExponent) : top;
    erosion[i] = h - next;
    height[i] = next;
  }
}
