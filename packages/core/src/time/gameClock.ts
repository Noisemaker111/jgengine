/**
 * Simulation clock: real time scaled into game time, plus the derived game-day counter.
 */
export const DEFAULT_TIME_SCALE = 24;
export const SECONDS_PER_GAME_DAY = 24 * 3600;

export function sanitizeGameTimeScale(timeScale?: number | null): number {
  if (typeof timeScale !== "number" || !Number.isFinite(timeScale) || timeScale <= 0) {
    return DEFAULT_TIME_SCALE;
  }
  return timeScale;
}

export function getScaledElapsedMs(createdAt: number, now: number, timeScale?: number | null): number {
  return Math.max(0, Math.floor((now - createdAt) * sanitizeGameTimeScale(timeScale)));
}

export function getCurrentGameTimestamp(createdAt: number, now: number, timeScale?: number | null): number {
  return createdAt + getScaledElapsedMs(createdAt, now, timeScale);
}

export function computeGameDay(createdAt: number, now: number = Date.now(), timeScale?: number | null): number {
  return Math.floor(getScaledElapsedMs(createdAt, now, timeScale) / 1000 / SECONDS_PER_GAME_DAY);
}
