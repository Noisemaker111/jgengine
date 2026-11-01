// @skill jgengine-world
import type { AircraftAfterburner } from "./afterburner";
import type { AircraftAtmosphere } from "./atmosphere";
import type { AircraftAutorotation } from "./autorotation";
import type { AircraftDerivatives } from "./derivatives";
import type { AircraftEngineSpool } from "./engineSpool";
import type { AircraftMachDrag } from "./machDrag";
import type { AircraftNozzle } from "./nozzle";
import type { AircraftPolar } from "./polar";
import type { AircraftPropeller } from "./propeller";
import type { AircraftRotatingEarth } from "./rotatingEarth";
import type { AircraftRotorInflow } from "./rotorInflow";
import type { AircraftThrustLapse } from "./thrustLapse";
import type { AircraftWingGroundEffect } from "./wingGroundEffect";

/**
 * The physical effects an aircraft can use. Each is a separate term with its own parameters and its own `strength`, a
 * multiplier from `0` (off: the simple model's term) upward, where `1` is exactly what the reference measures and the
 * dial keeps going past it; each file documents what the dial scales past `1` and its sane range. Between `0` and `1`
 * a term blends from the simple model's value to the reference's. An effect left out keeps the simple model's term, so
 * an arcade jet is a plain throttle and stick and a real one is `aircraftFromReference("f-16")`.
 */
export interface AircraftEffects {
  /** Air density, pressure and speed of sound fall with altitude (U.S. Standard Atmosphere 1976). */
  atmosphere?: AircraftAtmosphere;
  /** Jet thrust changes with altitude and Mach. */
  thrustLapse?: AircraftThrustLapse;
  /** Turbine spool time constant and idle thrust. */
  spool?: AircraftEngineSpool;
  /** Reheat past the dry throttle stop. */
  afterburner?: AircraftAfterburner;
  /** Fixed-pitch propeller on a piston engine: thrust from advance ratio, shaft speed, density lapse. */
  propeller?: AircraftPropeller;
  /** Whole-aircraft lift, drag and side force from coefficient data (lift curve, stall, induced drag). */
  polar?: AircraftPolar;
  /** Whole-aircraft moments from stability, control and damping derivatives. */
  derivatives?: AircraftDerivatives;
  /** Induced drag relief near the ground. */
  wingGroundEffect?: AircraftWingGroundEffect;
  /** Body drag coefficient by Mach number in place of the constant `dragArea`. */
  machDrag?: AircraftMachDrag;
  /** Blade-element rotor thrust and torque with momentum inflow, vortex ring and ground effect. */
  rotorInflow?: AircraftRotorInflow;
  /** Rotor speed as a governed inertia, so a dead engine autorotates. */
  autorotation?: AircraftAutorotation;
  /** Rocket thrust lost to ambient pressure on the nozzle exit. */
  nozzle?: AircraftNozzle;
  /** Spherical, spinning planet: inverse-square gravity, curvature, Coriolis and centrifugal terms. */
  rotatingEarth?: AircraftRotatingEarth;
}

/**
 * An effect's strength: `0` when absent, else its `strength` (default `1`), never below `0`.
 * @capability aircraft-effects the strength an aircraft effect runs at
 */
export function effectStrength(effect: { strength?: number } | undefined): number {
  return effect === undefined ? 0 : Math.max(0, effect.strength ?? 1);
}

/**
 * Blends a simple term into the physical one up to strength 1, then scales the physical term with the strength.
 * @capability aircraft-effects blend a simple-model term into a physical term by strength
 */
export function mixEffect(simple: number, physical: number, strength: number): number {
  return strength <= 0 ? simple : strength >= 1 ? physical * strength : simple + (physical - simple) * strength;
}
