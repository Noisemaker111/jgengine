import { createStateSchedule, type SchedulePhase, type StateSchedule } from "../time/stateSchedule";
import type { WindField, WindVector } from "./wind";

export interface WindZoneState {
  direction: WindVector;
  speed: number;
  /** Announcement label for HUD countdowns ("gale", "calm", "tailwind"). */
  label?: string;
}

export interface WindZoneConfig {
  id: string;
  center: readonly [number, number];
  radius: number;
  phases: readonly SchedulePhase<WindZoneState>[];
  offsetSeconds?: number;
}

export interface WindZonesConfig {
  zones: readonly WindZoneConfig[];
  ambient?: WindField;
}

export interface WindShiftForecast {
  zoneId: string;
  at: number;
  /** Seconds from the queried time until the shift. */
  inSeconds: number;
  next: WindZoneState;
}

/**
 * Named, discrete wind zones over an ambient field — each zone runs a deterministic
 * `StateSchedule` of wind states, so games get scheduled shifts with advance announcement
 * (`forecastShift` drives the "gale in 12s" countdown) instead of one continuous field.
 */
export interface WindZones {
  zoneIds(): readonly string[];
  zoneAt(x: number, z: number): string | null;
  windAt(x: number, z: number, t: number): WindVector;
  stateAt(zoneId: string, t: number): WindZoneState | null;
  forecastShift(zoneId: string, t: number): WindShiftForecast | null;
}

interface ResolvedZone {
  config: WindZoneConfig;
  schedule: StateSchedule<WindZoneState>;
}

function windVectorOf(state: WindZoneState): WindVector {
  const length = Math.hypot(state.direction[0], state.direction[1]);
  if (length === 0 || state.speed === 0) return [0, 0];
  return [(state.direction[0] / length) * state.speed, (state.direction[1] / length) * state.speed];
}

export function createWindZones(config: WindZonesConfig): WindZones {
  const zones = new Map<string, ResolvedZone>();
  const order: string[] = [];
  for (const zone of config.zones) {
    if (zones.has(zone.id)) throw new Error(`duplicate wind zone: ${zone.id}`);
    zones.set(zone.id, {
      config: zone,
      schedule: createStateSchedule({
        phases: zone.phases,
        ...(zone.offsetSeconds === undefined ? {} : { offsetSeconds: zone.offsetSeconds }),
      }),
    });
    order.push(zone.id);
  }

  function zoneAt(x: number, z: number): string | null {
    let best: string | null = null;
    let bestRadius = Number.POSITIVE_INFINITY;
    for (const id of order) {
      const zone = zones.get(id)!;
      const distance = Math.hypot(x - zone.config.center[0], z - zone.config.center[1]);
      if (distance <= zone.config.radius && zone.config.radius <= bestRadius) {
        best = id;
        bestRadius = zone.config.radius;
      }
    }
    return best;
  }

  return {
    zoneIds: () => order.slice(),
    zoneAt,
    windAt(x, z, t) {
      const id = zoneAt(x, z);
      if (id !== null) return windVectorOf(zones.get(id)!.schedule.stateAt(t));
      return config.ambient === undefined ? [0, 0] : config.ambient.atPoint(x, z, t);
    },
    stateAt(zoneId, t) {
      const zone = zones.get(zoneId);
      return zone === undefined ? null : zone.schedule.stateAt(t);
    },
    forecastShift(zoneId, t) {
      const zone = zones.get(zoneId);
      if (zone === undefined || zone.config.phases.length < 2) return null;
      const at = zone.schedule.nextTransitionAt(t);
      if (!Number.isFinite(at)) return null;
      return { zoneId, at, inSeconds: at - t, next: zone.schedule.stateAt(at) };
    },
  };
}
