import { computeEffectiveStats, install, uninstall, type InstalledPart } from "@jgengine/core/item/modularItem";

import { KART_DEF, type WreckwayPartDef } from "./catalog";

export interface SwapResult {
  installed: readonly InstalledPart[];
  ejected: WreckwayPartDef | null;
}

export function swapPart(installed: readonly InstalledPart[], part: WreckwayPartDef): SwapResult {
  const previous = installed.find((entry) => entry.slotId === part.category);
  const ejected = (previous?.part as WreckwayPartDef | undefined) ?? null;
  const base = ejected === null ? installed : uninstall(installed, part.category);
  const result = install(KART_DEF, base, part.category, part);
  return { installed: result.status === "ok" ? result.installed : base, ejected };
}

export interface KartTuning {
  topSpeed: number;
  engineAccel: number;
  turnRate: number;
  jumpPower: number;
  hasPlow: boolean;
  armorCharges: number;
}

const MIN_TOP_SPEED = 3;
const MIN_ACCEL = 4;
const MIN_TURN_RATE = 0.6;

export function tuningFrom(installed: readonly InstalledPart[]): KartTuning {
  const stats = computeEffectiveStats(KART_DEF, installed);
  return {
    topSpeed: Math.max(MIN_TOP_SPEED, stats.topSpeed ?? 0),
    engineAccel: Math.max(MIN_ACCEL, stats.engineAccel ?? 0),
    turnRate: Math.max(MIN_TURN_RATE, stats.turnRate ?? 0),
    jumpPower: Math.max(0, stats.jumpPower ?? 0),
    hasPlow: (stats.plow ?? 0) > 0,
    armorCharges: Math.max(0, Math.round(stats.armor ?? 0)),
  };
}

export function partInSlotId(installed: readonly InstalledPart[], slotId: string): string | null {
  return installed.find((entry) => entry.slotId === slotId)?.part.id ?? null;
}
