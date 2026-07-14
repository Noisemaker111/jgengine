import { defineKeyedStore } from "@jgengine/core/store/defineKeyedStore";

import type { ValeCupView } from "../minigames/valeCup";
import type { YumiView } from "../minigames/yumi";
import type { EquipSlot, ProfessionId } from "../model";
import type { PetView } from "../pets/systems";
import type { MailView } from "../mail/systems";
import type { DelveSessionView } from "../delves/systems";
import type { FiestaRecord, FiestaView } from "../arena/fiesta";
import type { AuraState, CastState, TalentsView } from "./hero";

export const classStore = defineKeyedStore<string | null>((userId) => `class:${userId}`, null);
export const equipStore = defineKeyedStore<Partial<Record<EquipSlot, string>>>(
  (userId) => `equip:${userId}`,
  () => ({}),
);
export const deadStore = defineKeyedStore<boolean>((userId) => `dead:${userId}`, false);
export const castStore = defineKeyedStore<CastState | null>((userId) => `cast:${userId}`, null);
export const panelStore = defineKeyedStore<string | null>((userId) => `panel:${userId}`, null);
export const shopStore = defineKeyedStore<string | null>((userId) => `shop:${userId}`, null);
export const dialogueStore = defineKeyedStore<string | null>((userId) => `dialogue:${userId}`, null);
export const autoAttackStore = defineKeyedStore<boolean>((userId) => `autoattack:${userId}`, false);
export const aurasStore = defineKeyedStore<AuraState[]>((instanceId) => `auras:${instanceId}`, () => []);
export const barStore = defineKeyedStore<readonly string[]>((userId) => `bar:${userId}`, () => []);
export const specStore = defineKeyedStore<string | null>((userId) => `spec:${userId}`, null);
export const talentsStore = defineKeyedStore<TalentsView | null>((userId) => `talents:${userId}`, null);
export const restedStore = defineKeyedStore<number>((userId) => `rested:${userId}`, 0);
export const bankStore = defineKeyedStore<boolean>((userId) => `bank:${userId}`, false);
export const professionsStore = defineKeyedStore<Record<ProfessionId, number>>(
  (userId) => `profs:${userId}`,
  () => ({ mining: 1, logging: 1, herbalism: 1, fishing: 1, crafting: 1 }),
);
export const nameStore = defineKeyedStore<string | null>((userId) => `name:${userId}`, null);
export const cinematicStore = defineKeyedStore<boolean>((userId) => `cinematic:${userId}`, false);
export const deathStatsStore = defineKeyedStore<{ level: number; xp: number; xpMax: number } | null>(
  (userId) => `deathstats:${userId}`,
  null,
);
export const corpseStore = defineKeyedStore<readonly [number, number] | null>(
  (userId) => `corpse:${userId}`,
  null,
);
export const fishingStore = defineKeyedStore<{ startedAt: number } | null>(
  (userId) => `fishing:${userId}`,
  null,
);
export const petStore = defineKeyedStore<PetView | null>((userId) => `pet:${userId}`, null);
export const yumiStore = defineKeyedStore<YumiView | null>((userId) => `yumi:${userId}`, null);
export const valeCupStore = defineKeyedStore<ValeCupView | null>((userId) => `valecup:${userId}`, null);
export const mailOpenStore = defineKeyedStore<boolean>((userId) => `mail:${userId}`, false);
export const marketOpenStore = defineKeyedStore<boolean>((userId) => `market:${userId}`, false);
export const mailViewStore = defineKeyedStore<MailView | null>((userId) => `mailView:${userId}`, null);
export const delveStore = defineKeyedStore<DelveSessionView | null>((userId) => `delve:${userId}`, null);
export const fiestaStore = defineKeyedStore<FiestaView | null>((userId) => `fiesta:${userId}`, null);
export const fiestaRecordStore = defineKeyedStore<FiestaRecord>(
  (userId) => `arenaFiesta:${userId}`,
  () => ({ wins: 0, losses: 0 }),
);
