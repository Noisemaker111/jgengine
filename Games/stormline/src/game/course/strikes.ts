import { pointInTelegraph, telegraphFired, telegraphProgress, type TelegraphConfig } from "@jgengine/core/combat/telegraph";
import type { StrikeZoneSpec } from "./catalog";

export type StrikePhase = "windup" | "active" | "cooldown";

export interface StrikeCycle {
  readonly phase: StrikePhase;
  readonly windupProgress: number;
}

export function cycleLengthMs(zone: StrikeZoneSpec): number {
  return zone.windupMs + zone.activeMs + zone.cooldownMs;
}

export function cycleLocalMs(zone: StrikeZoneSpec, nowMs: number): number {
  const cycle = cycleLengthMs(zone);
  const raw = (nowMs + zone.phaseOffsetMs) % cycle;
  return raw < 0 ? raw + cycle : raw;
}

export function strikeCycle(zone: StrikeZoneSpec, nowMs: number): StrikeCycle {
  const local = cycleLocalMs(zone, nowMs);
  const startedAt = nowMs - local;
  if (!telegraphFired(zone.windupMs, startedAt, nowMs)) {
    return { phase: "windup", windupProgress: telegraphProgress(zone.windupMs, startedAt, nowMs) };
  }
  if (local < zone.windupMs + zone.activeMs) return { phase: "active", windupProgress: 1 };
  return { phase: "cooldown", windupProgress: 1 };
}

export function isStrikeActive(zone: StrikeZoneSpec, nowMs: number): boolean {
  return strikeCycle(zone, nowMs).phase === "active";
}

export function strikeHitsProgress(zone: StrikeZoneSpec, truckProgress: number): boolean {
  const config: TelegraphConfig = { shape: { kind: "circle", radius: zone.radius }, at: [0, 0, zone.progress] };
  return pointInTelegraph(config, [0, 0, truckProgress]);
}
