import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";

import type { GunDef } from "../handroll";

/** What this run has met: gun models held, enemy types killed, zones entered, and its running counts. */
export interface Discovery {
  guns: readonly string[];
  enemies: readonly string[];
  zones: readonly string[];
  kills: number;
  gunsLooted: number;
}

export const discoveryStore = defineStore<Discovery>("scrap.discovery", () => ({
  guns: [],
  enemies: [],
  zones: [],
  kills: 0,
  gunsLooted: 0,
}));

/** A gun's model: its named legendary, or its maker and family. */
export function gunModel(gun: Pick<GunDef, "model" | "manufacturer" | "family">): string {
  return gun.model ?? `${gun.manufacturer}:${gun.family}`;
}

function add(list: readonly string[], id: string): readonly string[] {
  return list.includes(id) ? list : [...list, id];
}

/** A gun went into a weapon slot. */
export function noteGunHeld(ctx: GameContext, gun: Pick<GunDef, "model" | "manufacturer" | "family">): void {
  const seen = discoveryStore.read(ctx);
  discoveryStore.write(ctx, { ...seen, guns: add(seen.guns, gunModel(gun)), gunsLooted: seen.gunsLooted + 1 });
}

export function noteKill(ctx: GameContext, catalogId: string): void {
  const seen = discoveryStore.read(ctx);
  discoveryStore.write(ctx, { ...seen, enemies: add(seen.enemies, catalogId), kills: seen.kills + 1 });
}

export function noteZone(ctx: GameContext, zoneId: string): void {
  const seen = discoveryStore.read(ctx);
  if (!seen.zones.includes(zoneId)) discoveryStore.write(ctx, { ...seen, zones: [...seen.zones, zoneId] });
}
