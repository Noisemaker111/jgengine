import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { seededRng } from "@jgengine/core/random/rng";
import { perContext } from "@jgengine/core/runtime/perContext";

import { aurasOf, syncAuras, type HeroSheet } from "../session/hero";
import type { SetProc } from "../items/sets";

const rng = seededRng("claudecraft-setprocs");
const icdOf = perContext(() => new Map<string, Map<string, number>>());

function ready(ctx: GameContext, userId: string, procId: string, now: number, icdSec: number): boolean {
  if (icdSec <= 0) return true;
  const readyAt = icdOf(ctx).get(userId)?.get(procId) ?? 0;
  return now >= readyAt;
}

function arm(ctx: GameContext, userId: string, procId: string, now: number, icdSec: number): void {
  if (icdSec <= 0) return;
  const icd = icdOf(ctx);
  let map = icd.get(userId);
  if (map === undefined) {
    map = new Map();
    icd.set(userId, map);
  }
  map.set(procId, now + icdSec);
}

function selfBuff(
  ctx: GameContext,
  userId: string,
  proc: SetProc & { effect: { kind: "selfBuff" } },
  now: number,
): void {
  const stat = proc.effect.buffStat;
  const list = aurasOf(ctx, userId);
  const existing = list.findIndex((aura) => aura.id === proc.id);
  if (existing >= 0) list.splice(existing, 1);
  list.push({
    id: proc.id,
    name: proc.name,
    icon: proc.icon,
    school: "physical",
    kind: "buff",
    sourceId: userId,
    amount: 0,
    tickEvery: 0,
    nextTickAt: now,
    expiresAt: now + proc.effect.durationSec,
    buffStat: stat,
    buffAmount: proc.effect.amount,
  });
  syncAuras(ctx, userId);
}

function nextCastFree(
  ctx: GameContext,
  userId: string,
  proc: SetProc & { effect: { kind: "nextCastFree" } },
  now: number,
): void {
  const list = aurasOf(ctx, userId);
  const existing = list.findIndex((aura) => aura.id === proc.id);
  if (existing >= 0) list.splice(existing, 1);
  list.push({
    id: proc.id,
    name: proc.name,
    icon: proc.icon,
    school: "arcane",
    kind: "buff",
    sourceId: userId,
    amount: 0,
    tickEvery: 0,
    nextTickAt: now,
    expiresAt: now + proc.effect.durationSec,
    buffStat: "next_cast_free",
    buffAmount: 0,
  });
  syncAuras(ctx, userId);
}

function targetDot(
  ctx: GameContext,
  userId: string,
  targetId: string,
  proc: SetProc & { effect: { kind: "targetDot" } },
  now: number,
): void {
  const list = aurasOf(ctx, targetId);
  const e = proc.effect;
  const existing = list.find((aura) => aura.id === proc.id);
  if (existing !== undefined) {
    existing.stacks = Math.min(e.maxStacks, (existing.stacks ?? 1) + 1);
    existing.amount = e.amount * existing.stacks;
    existing.expiresAt = now + e.durationSec;
    existing.sourceId = userId;
  } else {
    list.push({
      id: proc.id,
      name: proc.name,
      icon: proc.icon,
      school: "physical",
      kind: "dot",
      sourceId: userId,
      amount: e.amount,
      tickEvery: e.tickSec,
      nextTickAt: now + e.tickSec,
      expiresAt: now + e.durationSec,
      stacks: 1,
      maxStacks: e.maxStacks,
    });
  }
  syncAuras(ctx, targetId);
}

function fire(
  ctx: GameContext,
  userId: string,
  procs: readonly SetProc[],
  trigger: SetProc["trigger"],
  targetId: string | null,
): void {
  const now = ctx.time.now();
  for (const proc of procs) {
    if (proc.trigger !== trigger) continue;
    if (!ready(ctx, userId, proc.id, now, proc.icdSec)) continue;
    if (proc.chance < 1 && rng() >= proc.chance) continue;
    if (proc.effect.kind === "selfBuff") {
      selfBuff(ctx, userId, proc as SetProc & { effect: { kind: "selfBuff" } }, now);
    } else if (proc.effect.kind === "nextCastFree") {
      nextCastFree(ctx, userId, proc as SetProc & { effect: { kind: "nextCastFree" } }, now);
    } else {
      if (targetId === null) continue;
      targetDot(ctx, userId, targetId, proc as SetProc & { effect: { kind: "targetDot" } }, now);
    }
    arm(ctx, userId, proc.id, now, proc.icdSec);
  }
}

export function fireWeaponCritProcs(
  ctx: GameContext,
  userId: string,
  sheet: HeroSheet,
  targetId: string | null,
): void {
  if (sheet.setProcs.length === 0) return;
  fire(ctx, userId, sheet.setProcs, "weaponCrit", targetId);
}

export function fireSpellCastProcs(ctx: GameContext, userId: string, sheet: HeroSheet): void {
  if (sheet.setProcs.length === 0) return;
  fire(ctx, userId, sheet.setProcs, "spellCast", null);
}

export function consumeNextCastFree(ctx: GameContext, userId: string): boolean {
  const list = aurasOf(ctx, userId);
  const index = list.findIndex((aura) => aura.buffStat === "next_cast_free");
  if (index < 0) return false;
  list.splice(index, 1);
  syncAuras(ctx, userId);
  return true;
}
