import { seededStreams } from "@jgengine/core/random/rng";
import { windField, type WindField } from "@jgengine/core/world/wind";

export interface GustEvent {
  id: string;
  startSec: number;
  durationSec: number;
  direction: readonly [number, number];
  strength: number;
}

const AMBIENT_SPEED = 1.1;
const AMBIENT_DIRECTION: readonly [number, number] = [0.8, 0.45];
const GUST_MIN_STRENGTH = 4;
const GUST_MAX_STRENGTH = 9;
const GUST_MIN_DURATION = 3;
const GUST_MAX_DURATION = 6;
const GUST_MIN_COUNT = 6;
const SECONDS_PER_GUST_SLOT = 24;

export function createAmbientWind(seed: string): WindField {
  return windField({ direction: AMBIENT_DIRECTION, speed: AMBIENT_SPEED, gust: 0, seed: `${seed}:ambient` });
}

export function gustCountFor(totalSeconds: number): number {
  return Math.max(GUST_MIN_COUNT, Math.round(totalSeconds / SECONDS_PER_GUST_SLOT));
}

export function generateGustSchedule(seed: string, totalSeconds: number): readonly GustEvent[] {
  const count = gustCountFor(totalSeconds);
  const rng = seededStreams(seed)("gusts");
  const slot = totalSeconds / count;
  const events: GustEvent[] = [];
  for (let i = 0; i < count; i += 1) {
    const duration = GUST_MIN_DURATION + rng() * (GUST_MAX_DURATION - GUST_MIN_DURATION);
    const jitter = rng() * Math.max(0, slot - duration);
    const start = i * slot + jitter;
    const angle = rng() * Math.PI * 2;
    const strength = GUST_MIN_STRENGTH + rng() * (GUST_MAX_STRENGTH - GUST_MIN_STRENGTH);
    events.push({
      id: `gust-${i}`,
      startSec: start,
      durationSec: duration,
      direction: [Math.sin(angle), Math.cos(angle)],
      strength,
    });
  }
  return events;
}

export function activeGust(schedule: readonly GustEvent[], timeSec: number): GustEvent | null {
  for (const event of schedule) {
    if (timeSec >= event.startSec && timeSec <= event.startSec + event.durationSec) return event;
  }
  return null;
}

export interface WindSample {
  vector: readonly [number, number];
  gust: GustEvent | null;
}

export function windAt(ambient: WindField, schedule: readonly GustEvent[], timeSec: number): WindSample {
  const [ax, az] = ambient.at(timeSec);
  const gust = activeGust(schedule, timeSec);
  if (gust === null) return { vector: [ax, az], gust: null };
  return { vector: [ax + gust.direction[0] * gust.strength, az + gust.direction[1] * gust.strength], gust };
}
