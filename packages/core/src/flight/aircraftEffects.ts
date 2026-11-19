// @skill jgengine-world
import type { AircraftAfterburner } from "./afterburner";
import type { AircraftAtmosphere } from "./atmosphere";
import type { AircraftAutorotation } from "./autorotation";
import type { AircraftDerivatives } from "./derivatives";
import type { AircraftEngineSpool } from "./engineSpool";
import type { AircraftMachDrag } from "./machDrag";
import type { AircraftMainGear } from "./mainGear";
import type { AircraftNozzle } from "./nozzle";
import type { AircraftPolar } from "./polar";
import type { AircraftPropeller } from "./propeller";
import type { AircraftRotatingEarth } from "./rotatingEarth";
import type { AircraftRotorInflow } from "./rotorInflow";
import type { AircraftThrustLapse } from "./thrustLapse";
import type { AircraftWingGroundEffect } from "./wingGroundEffect";

export interface AircraftEffects {
  atmosphere?: AircraftAtmosphere;
  thrustLapse?: AircraftThrustLapse;
  spool?: AircraftEngineSpool;
  afterburner?: AircraftAfterburner;
  propeller?: AircraftPropeller;
  polar?: AircraftPolar;
  derivatives?: AircraftDerivatives;
  /** The runway pushes through the main wheels behind the centre of mass, so the nose lifts only when the elevator beats the weight. */
  mainGear?: AircraftMainGear;
  wingGroundEffect?: AircraftWingGroundEffect;
  machDrag?: AircraftMachDrag;
  rotorInflow?: AircraftRotorInflow;
  /** Rotor speed as a governed inertia, so a dead engine autorotates. */
  autorotation?: AircraftAutorotation;
  nozzle?: AircraftNozzle;
  rotatingEarth?: AircraftRotatingEarth;
}

/**
 * An effect's strength: `0` when absent, else its `strength` (default `1`), never below `0`.
 * @capability aircraft-effects the strength an aircraft effect runs at
 */
export function effectStrength(effect: { strength?: number } | undefined): number {
  return effect === undefined ? 0 : Math.max(0, effect.strength ?? 1);
}

/** @capability aircraft-effects blend a simple-model term into a physical term by strength */
export function mixEffect(simple: number, physical: number, strength: number): number {
  return strength <= 0 ? simple : strength >= 1 ? physical * strength : simple + (physical - simple) * strength;
}
