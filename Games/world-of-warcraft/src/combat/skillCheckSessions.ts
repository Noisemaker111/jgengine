import type { SkillCheckConfig } from "@jgengine/core/interaction/skillCheck";

const startedAtByUser = new Map<string, number>();

export const fishingCheckConfig: SkillCheckConfig = {
  trackWidth: 100,
  zone: { start: 40, end: 60 },
  markerPeriod: 1.6,
  window: 6,
};

export function startFishingSession(userId: string, startedAt: number): void {
  startedAtByUser.set(userId, startedAt);
}

export function fishingSessionStartedAt(userId: string): number | undefined {
  return startedAtByUser.get(userId);
}

export function endFishingSession(userId: string): void {
  startedAtByUser.delete(userId);
}
