import { defineStore } from "@jgengine/core/store/defineStore";
import type { RunSnapshot } from "./session";

export const IDLE: RunSnapshot = {
  status: "ready",
  wave: 1,
  waveTotal: 10,
  endless: false,
  alive: 0,
  intermissionLeft: 0,
  kills: 0,
  score: 0,
  shotsFired: 0,
  shotsHit: 0,
  elapsed: 0,
};

export interface RunRecords {
  score?: number;
  wave?: number;
  accuracy?: number;
}

export const runStore = defineStore<RunSnapshot>("run", IDLE);
export const selectedSlotStore = defineStore<number>("selectedSlot", 0);
export const recordsStore = defineStore<RunRecords>("records", {});
export const shopOpenStore = defineStore<string | undefined>("shopOpen", undefined);
