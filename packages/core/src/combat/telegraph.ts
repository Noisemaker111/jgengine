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
