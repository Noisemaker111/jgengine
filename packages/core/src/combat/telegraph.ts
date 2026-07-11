import type { EntityPosition } from "../scene/entityStore";

export type TelegraphShape =
  | { kind: "circle"; radius: number }
  | { kind: "ring"; radius: number; innerRadius: number }
  | { kind: "cone"; radius: number; angle: number }
  | { kind: "line"; length: number; width: number };

export interface TelegraphConfig {
  shape: TelegraphShape;
  at: EntityPosition;
  dir?: number;
  windupMs?: number;
  turns?: number;
  kind?: string;
}

export function telegraphProgress(windupMs: number, startedAtMs: number, nowMs: number): number {
  if (windupMs <= 0) return 1;
  return Math.max(0, Math.min(1, (nowMs - startedAtMs) / windupMs));
}

export interface HazardCycleConfig {
  windupMs: number;
  activeMs: number;
  /** Rest between one activation's end and the next windup; default `0` (back-to-back). */
  cooldownMs?: number;
  /** Shifts the whole cycle — staggers identical hazards. */
  offsetMs?: number;
}

export type HazardPhase = "windup" | "active" | "cooldown";

export interface HazardCycleSample {
  phase: HazardPhase;
  /** Elapsed fraction of the current phase in `[0, 1]` — the windup fraction is the decal fill. */
  fraction: number;
  remainingMs: number;
  /** How many full cycles have completed before this one. */
  cycleIndex: number;
}

/**
 * Deterministic repeating hazard timing — windup → active → cooldown as a pure function of absolute
 * time, for recurring flame vents, crushers, lightning rings. Sample `hazardCycleAt` each tick: draw
 * the telegraph during `windup`, apply the effect during `active`, rest through `cooldown`.
 */
export function hazardCycleAt(config: HazardCycleConfig, nowMs: number): HazardCycleSample {
  const cooldownMs = Math.max(0, config.cooldownMs ?? 0);
  const cycleMs = config.windupMs + config.activeMs + cooldownMs;
  if (cycleMs <= 0) return { phase: "active", fraction: 1, remainingMs: 0, cycleIndex: 0 };
  const shifted = nowMs + (config.offsetMs ?? 0);
  const local = ((shifted % cycleMs) + cycleMs) % cycleMs;
  const cycleIndex = Math.floor((shifted - local) / cycleMs);
  if (local < config.windupMs) {
    return {
      phase: "windup",
      fraction: config.windupMs <= 0 ? 1 : local / config.windupMs,
      remainingMs: config.windupMs - local,
      cycleIndex,
    };
  }
  const intoActive = local - config.windupMs;
  if (intoActive < config.activeMs) {
    return {
      phase: "active",
      fraction: config.activeMs <= 0 ? 1 : intoActive / config.activeMs,
      remainingMs: config.activeMs - intoActive,
      cycleIndex,
    };
  }
  const intoCooldown = intoActive - config.activeMs;
  return {
    phase: "cooldown",
    fraction: cooldownMs <= 0 ? 1 : intoCooldown / cooldownMs,
    remainingMs: cooldownMs - intoCooldown,
    cycleIndex,
  };
}

/** Absolute time the hazard's next `active` phase begins at or after `nowMs` — the countdown seam. */
export function nextHazardActiveAt(config: HazardCycleConfig, nowMs: number): number {
  const sample = hazardCycleAt(config, nowMs);
  if (sample.phase === "windup") return nowMs + sample.remainingMs;
  const cooldownMs = Math.max(0, config.cooldownMs ?? 0);
  const restMs = sample.phase === "active" ? sample.remainingMs + cooldownMs : sample.remainingMs;
  return nowMs + restMs + config.windupMs;
}

export function telegraphFired(windupMs: number, startedAtMs: number, nowMs: number): boolean {
  return nowMs - startedAtMs >= windupMs;
}

export function telegraphTurnProgress(config: TelegraphConfig, startedTurn: number, currentTurn: number): number {
  const turns = config.turns ?? 0;
  if (turns <= 0) return 1;
  return Math.max(0, Math.min(1, (currentTurn - startedTurn) / turns));
}

export function telegraphFiredAtTurn(config: TelegraphConfig, startedTurn: number, currentTurn: number): boolean {
  const turns = config.turns ?? 0;
  return currentTurn - startedTurn >= turns;
}

export function telegraphTurnsRemaining(config: TelegraphConfig, startedTurn: number, currentTurn: number): number {
  const turns = config.turns ?? 0;
  return Math.max(0, turns - (currentTurn - startedTurn));
}

function planarDelta(config: TelegraphConfig, point: EntityPosition): { dx: number; dz: number } {
  return { dx: point[0] - config.at[0], dz: point[2] - config.at[2] };
}

export function pointInTelegraph(config: TelegraphConfig, point: EntityPosition): boolean {
  const { shape } = config;
  const { dx, dz } = planarDelta(config, point);
  const dist = Math.hypot(dx, dz);
  const dir = config.dir ?? 0;

  if (shape.kind === "circle") return dist <= shape.radius;
  if (shape.kind === "ring") return dist >= shape.innerRadius && dist <= shape.radius;
  if (shape.kind === "cone") {
    if (dist > shape.radius || dist === 0) return dist === 0;
    const angleTo = Math.atan2(dx, dz);
    let delta = angleTo - dir;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return Math.abs(delta) <= shape.angle / 2;
  }
  const forwardX = Math.sin(dir);
  const forwardZ = Math.cos(dir);
  const along = dx * forwardX + dz * forwardZ;
  const lateral = Math.abs(dx * forwardZ - dz * forwardX);
  return along >= 0 && along <= shape.length && lateral <= shape.width / 2;
}
