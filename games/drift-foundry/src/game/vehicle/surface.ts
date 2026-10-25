import { ROW_SIX_TRACK, type ActiveHazard, type Track } from "../tracks/catalog";
import { zoneAt, type ZoneSurface } from "../zones/catalog";

/** Grip on the dirt shoulders either side of the paved haul strip. */
const SHOULDER_GRIP = 0.84;
/** Metres over which the paved edge fades into the shoulder, so grip does not step in one tick. */
const EDGE_BLEND = 1.2;

/** What each hazard does to the tires while the kart is in it. */
const HAZARD_GRIP: Readonly<Record<string, number>> = { slick: 0.78, flood: 0.86, slag: 0.9, belt: 1, train: 1 };

export interface SurfaceSample {
  /** The yard surface the kart is over (zone-owned authored data). */
  zone: ZoneSurface;
  /** False once the kart is out on the dirt shoulders. */
  paved: boolean;
  /** Combined grip multiplier handed to the sim. */
  grip: number;
  /** What the HUD/evidence calls this patch of ground. */
  label: string;
}

function smoothstep(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/** Grip multiplier at a Row Six position - the legacy corridor's `surfaceFriction` hook. */
export function surfaceFrictionAt(x: number, z: number): number {
  return surfaceAt(x, z).grip;
}

/**
 * A track's ground at `lateral` metres off its centreline and `run` metres along it: an authored paved
 * strip, shoulders out to the walls, and each zone's yard surface deciding the base grip. On Row Six
 * the canyons are oil-slick, the appliance flats concrete, the gantry run loose gravel - so the same
 * corner taken a yard later holds differently. A hazard under the kart (glazed slag, standing water)
 * takes its own cut on top.
 */
export function surfaceAt(lateral: number, run: number, track: Track = ROW_SIX_TRACK, hazards: readonly ActiveHazard[] = []): SurfaceSample {
  const zone = zoneAt(run, track.zones).surface;
  const over = Math.abs(lateral) - track.def.pavedHalfWidth;
  const paved = over <= 0;
  const shoulder = 1 + (SHOULDER_GRIP - 1) * smoothstep(over / EDGE_BLEND);
  const hazard = hazards.find((entry) => (HAZARD_GRIP[entry.kind] ?? 1) < 1);
  const hazardGrip = hazards.reduce((product, entry) => product * (HAZARD_GRIP[entry.kind] ?? 1), 1);
  return {
    zone,
    paved,
    grip: zone.grip * shoulder * hazardGrip,
    label: hazard !== undefined ? hazard.label : paved ? zone.label : `${zone.label} SHOULDER`,
  };
}

/** What the hazards under a kart do to it beyond grip: drag (per second), a choked engine, a belt's push. */
export function hazardFeel(hazards: readonly ActiveHazard[]): { drag: number; topSpeedScale: number; push: number } {
  let drag = 0;
  let topSpeedScale = 1;
  let push = 0;
  for (const hazard of hazards) {
    if (hazard.kind === "flood") drag += 0.7 + 1.1 * hazard.push;
    else if (hazard.kind === "slag") topSpeedScale = Math.min(topSpeedScale, 0.55);
    else if (hazard.kind === "belt") push += hazard.push;
  }
  return { drag, topSpeedScale, push };
}
