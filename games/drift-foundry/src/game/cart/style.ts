/**
 * Style: the third line on the receipt. Drifts (an end-cap drift when it hugs the shelf ends), air
 * off a pallet ramp, riding the back bar standing up, and swatting other carts all score, and tricks
 * chained inside the combo window multiply. Pure: the session feeds it one sample a tick.
 */

export type StyleKind = "drift" | "endcap" | "air" | "ride" | "swat";

export interface StyleSample {
  /** Tire slide this tick, 0..1. */
  slip: number;
  speedKmh: number;
  airborne: boolean;
  /** Standing on the back bar. */
  riding: boolean;
  /** Within a few metres of the shelf ends: a drift here is an end-cap drift. */
  nearEdge: boolean;
  /** A wall or barricade stopped the cart this tick: the combo breaks. */
  crashed: boolean;
}

export interface StyleAward {
  kind: StyleKind;
  points: number;
  combo: number;
  label: string;
}

export interface StyleState {
  points: number;
  combo: number;
  best: number;
  tricks: number;
}

export interface StyleMeter {
  tick(dt: number, sample: StyleSample): readonly StyleAward[];
  /** Score a one-off trick the session saw (a mop swat). */
  award(kind: StyleKind, base: number, label: string): StyleAward;
  snapshot(): StyleState & { driftSeconds: number; airSeconds: number; comboLeft: number };
  reset(): void;
}

export const DRIFT_SLIP = 0.3;
export const DRIFT_MIN_KMH = 16;
/** A drift shorter than this is a wiggle, not a trick. */
export const DRIFT_MIN_SECONDS = 0.6;
/** Slip may dip under the threshold this long without ending the drift. */
const DRIFT_GRACE = 0.25;
export const AIR_MIN_SECONDS = 0.35;
const RIDE_MIN_KMH = 14;
/** Seconds of riding the back bar per scored chunk. */
const RIDE_CHUNK = 1.5;
/** Seconds after a trick in which the next one raises the combo. */
export const COMBO_WINDOW = 3;
const COMBO_STEPS = [1, 1.5, 2, 3] as const;

const POINTS = { drift: 60, endcap: 110, air: 140, ride: 25, swat: 75 } as const;

export function createStyleMeter(): StyleMeter {
  let points = 0;
  let comboStep = 0;
  let comboLeft = 0;
  let best = 0;
  let tricks = 0;
  let drift = 0;
  let driftGrace = 0;
  let driftEdge = false;
  let air = 0;
  let ride = 0;

  function score(kind: StyleKind, base: number, label: string): StyleAward {
    const combo = COMBO_STEPS[Math.min(comboStep, COMBO_STEPS.length - 1)]!;
    const earned = Math.round(base * combo);
    points += earned;
    tricks += 1;
    comboStep = comboLeft > 0 ? comboStep + 1 : 1;
    comboLeft = COMBO_WINDOW;
    const next = COMBO_STEPS[Math.min(comboStep, COMBO_STEPS.length - 1)]!;
    best = Math.max(best, next);
    return { kind, points: earned, combo, label: `${label} +${earned}${combo > 1 ? ` ×${combo}` : ""}` };
  }

  return {
    tick(dt, sample) {
      const out: StyleAward[] = [];
      if (sample.crashed) {
        comboStep = 0;
        comboLeft = 0;
        drift = 0;
        driftGrace = 0;
      }
      comboLeft = Math.max(0, comboLeft - dt);
      if (comboLeft === 0) comboStep = 0;

      const sliding = !sample.airborne && sample.slip >= DRIFT_SLIP && sample.speedKmh >= DRIFT_MIN_KMH;
      if (sliding) {
        drift += dt;
        driftGrace = DRIFT_GRACE;
        if (sample.nearEdge) driftEdge = true;
      } else if (drift > 0) {
        driftGrace -= dt;
        if (driftGrace <= 0) {
          if (drift >= DRIFT_MIN_SECONDS) {
            const kind: StyleKind = driftEdge ? "endcap" : "drift";
            out.push(score(kind, POINTS[kind] * drift, `${driftEdge ? "END-CAP DRIFT" : "DRIFT"} ${drift.toFixed(1)}s`));
          }
          drift = 0;
          driftEdge = false;
        }
      }

      if (sample.airborne) air += dt;
      else if (air > 0) {
        if (air >= AIR_MIN_SECONDS) out.push(score("air", POINTS.air * air * 2, `BIG AIR ${air.toFixed(1)}s`));
        air = 0;
      }

      if (sample.riding && sample.speedKmh >= RIDE_MIN_KMH) {
        ride += dt;
        if (ride >= RIDE_CHUNK) {
          ride -= RIDE_CHUNK;
          out.push(score("ride", POINTS.ride * RIDE_CHUNK * 2, "BACK-BAR RIDE"));
        }
      } else ride = 0;
      return out;
    },
    award(kind, base, label) {
      return score(kind, base || POINTS[kind], label);
    },
    snapshot() {
      return {
        points,
        combo: comboLeft > 0 ? COMBO_STEPS[Math.min(comboStep, COMBO_STEPS.length - 1)]! : 1,
        best,
        tricks,
        driftSeconds: drift,
        airSeconds: air,
        comboLeft,
      };
    },
    reset() {
      points = 0;
      comboStep = 0;
      comboLeft = 0;
      best = 0;
      tricks = 0;
      drift = 0;
      driftGrace = 0;
      driftEdge = false;
      air = 0;
      ride = 0;
    },
  };
}

/** Base points for a mop swat on one cart. */
export const SWAT_POINTS = POINTS.swat;
