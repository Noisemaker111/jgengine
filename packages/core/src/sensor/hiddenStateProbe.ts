import { distanceBetween } from "../scene/spatial";
import type { EntityPosition } from "../scene/entityStore";

export type HiddenStateValue = number | string | boolean;

export interface HiddenStateSource {
  id: string;
  position: EntityPosition;
  variables: Readonly<Record<string, HiddenStateValue>>;
}

export interface SensorProbeOptions {
  range: number;
  variableId: string;
  /** How reading `strength` falls off with distance. Default "linear". */
  falloff?: "linear" | "none";
}

export interface SensorReading {
  sourceId: string;
  variableId: string;
  value: HiddenStateValue;
  /** 1 at the source, 0 at the edge of `range` ("none" falloff always reads 1 in range). */
  strength: number;
  distance: number;
}

function strengthAt(distance: number, range: number, falloff: "linear" | "none"): number {
  if (falloff === "none") return 1;
  if (range <= 0) return 0;
  return Math.max(0, 1 - distance / range);
}

/**
 * A sensor verb: probe a hidden zone/entity state variable in range and surface
 * a reading (EMF reader, spirit box, thermometer, geiger counter). Unlike
 * `proximityPrompt` (a UI affordance), this reads world state the player has no
 * other way to see — the strongest in-range reading wins, mirroring how a real
 * handheld sensor needle settles on the loudest nearby source.
  * @internal
  */
export function probeHiddenState(
  origin: EntityPosition,
  sources: readonly HiddenStateSource[],
  options: SensorProbeOptions,
): SensorReading | null {
  const readings = probeHiddenStateAll(origin, sources, options);
  return readings.length === 0 ? null : readings[0]!;
}

/** All in-range readings for `variableId`, strongest first.
 * @internal
 */
export function probeHiddenStateAll(
  origin: EntityPosition,
  sources: readonly HiddenStateSource[],
  options: SensorProbeOptions,
): SensorReading[] {
  const { range, variableId, falloff = "linear" } = options;
  const readings: SensorReading[] = [];
  for (const source of sources) {
    if (!(variableId in source.variables)) continue;
    const distance = distanceBetween(origin, source.position);
    if (distance > range) continue;
    readings.push({
      sourceId: source.id,
      variableId,
      value: source.variables[variableId]!,
      strength: strengthAt(distance, range, falloff),
      distance,
    });
  }
  readings.sort((a, b) => b.strength - a.strength);
  return readings;
}
