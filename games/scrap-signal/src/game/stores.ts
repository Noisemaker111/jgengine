import { defineStore } from "@jgengine/core/store/defineStore";

import type { BlackMarketCounts } from "./commands";
import type { DownedPhase } from "@jgengine/core/combat/downed";

export const selectedSlotStore = defineStore<number>("selectedSlot", 0);

export interface ReserveView {
  phase: DownedPhase;
  secondsLeft: number;
}

export const reserveStore = defineStore<ReserveView>("reserve", { phase: "alive", secondsLeft: 0 });

export const lastPickupStore = defineStore<{ gunId: string; atMs: number } | null>("lastPickup", null);

export const openedChestsStore = defineStore<readonly string[]>("openedChests", () => []);

/** When each ammo crate was last emptied, in game seconds: a crate restocks a while later. */
export const ammoCratesOpenedStore = defineStore<Readonly<Record<string, number>>>("ammoCratesOpened", () => ({}));

/** When each camp member was first found dead, in game seconds: a cleared camp stays clear a while. */
export const campDeathsStore = defineStore<Readonly<Record<string, number>>>("campDeaths", () => ({}));

export const vendorOpenStore = defineStore<string | null>("vendorOpen", null);

/** The last thing someone said over the radio or face to face. */
export const speechStore = defineStore<{ speaker: string; line: string; atMs: number } | null>("scrap.speech", null);

export const blackMarketOpenStore = defineStore<boolean>("blackMarketOpen", false);

export const travelOpenStore = defineStore<boolean>("travelOpen", false);

export const discoveredStationsStore = defineStore<readonly string[]>("discoveredStations", () => []);

export const blackMarketStore = defineStore<BlackMarketCounts>("blackMarket", () => ({}));

export const skillsOpenStore = defineStore<boolean>("skillsOpen", false);

export const characterIdStore = defineStore<string | null>("characterId", null);

export const talentRanksStore = defineStore<Record<string, number>>("talentRanks", () => ({}));

export const reactorOpenStore = defineStore<{ atMs: number } | null>("reactorOpen", null);


export interface CurrentZoneView {
  id: string;
  name: string;
  level: number;
  atMs: number;
}

export const currentZoneStore = defineStore<CurrentZoneView | null>("currentZone", null);

