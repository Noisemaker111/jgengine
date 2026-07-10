import { seededStreams } from "@jgengine/core/random/rng";
import { windField, type WindField, type WindVector } from "@jgengine/core/world/wind";

export const WIND_SHIFT_SECONDS = 40;
export const WIND_SHIFT_COUNT = 9;
export const WIND_MIN_SPEED = 4;
export const WIND_SPEED_SPAN = 10;

export interface WindShift {
  index: number;
  directionRad: number;
  direction: WindVector;
  speed: number;
  field: WindField;
}

export function buildWindSchedule(seed: string | number, count = WIND_SHIFT_COUNT): readonly WindShift[] {
  const stream = seededStreams(seed)("wind-schedule");
  const shifts: WindShift[] = [];
  for (let index = 0; index < count; index += 1) {
    const directionRad = stream() * Math.PI * 2;
    const direction: WindVector = [Math.sin(directionRad), Math.cos(directionRad)];
    const speed = WIND_MIN_SPEED + stream() * WIND_SPEED_SPAN;
    shifts.push({
      index,
      directionRad,
      direction,
      speed,
      field: windField({
        direction,
        speed,
        gust: speed * 0.25,
        gustFrequency: 0.18,
        turbulence: 0.6,
        seed: `${seed}-wind-shift-${index}`,
      }),
    });
  }
  return shifts;
}

export interface WindStateAt {
  index: number;
  shift: WindShift;
  vector: WindVector;
  speed: number;
  secondsUntilNext: number;
  secondsIntoShift: number;
}

export function windStateAt(
  schedule: readonly WindShift[],
  shiftSeconds: number,
  elapsedSeconds: number,
): WindStateAt {
  const count = schedule.length;
  const cycleTime = ((elapsedSeconds % (shiftSeconds * count)) + shiftSeconds * count) % (shiftSeconds * count);
  const index = Math.min(count - 1, Math.floor(cycleTime / shiftSeconds));
  const shift = schedule[index]!;
  const secondsIntoShift = cycleTime - index * shiftSeconds;
  const vector = shift.field.at(secondsIntoShift);
  return {
    index,
    shift,
    vector,
    speed: Math.hypot(vector[0], vector[1]),
    secondsUntilNext: shiftSeconds - secondsIntoShift,
    secondsIntoShift,
  };
}

export function windVectorMagnitude(vector: WindVector): number {
  return Math.hypot(vector[0], vector[1]);
}
