export const RUN_SECONDS = 420;
export const DAWN_MANSION_MINUTES = 300;
export const MANSION_START_HOUR = 0;

export interface MansionClockReading {
  hour: number;
  minute: number;
  label: string;
  minutesElapsed: number;
  isDawn: boolean;
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

export function clampRunSeconds(t: number): number {
  if (Number.isNaN(t) || t < 0) return 0;
  return Math.min(t, RUN_SECONDS);
}

export function mansionMinutesAt(t: number): number {
  const clamped = clampRunSeconds(t);
  return (clamped / RUN_SECONDS) * DAWN_MANSION_MINUTES;
}

export function mansionClockAt(t: number): MansionClockReading {
  const minutesElapsed = mansionMinutesAt(t);
  const totalMinutes = MANSION_START_HOUR * 60 + minutesElapsed;
  const hour = Math.floor(totalMinutes / 60) % 24;
  const minute = Math.floor(totalMinutes % 60);
  return {
    hour,
    minute,
    label: `${pad2(hour)}:${pad2(minute)}`,
    minutesElapsed,
    isDawn: clampRunSeconds(t) >= RUN_SECONDS,
  };
}

export function secondsUntilDawn(t: number): number {
  return Math.max(0, RUN_SECONDS - clampRunSeconds(t));
}
