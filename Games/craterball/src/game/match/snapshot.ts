import { defineStore } from "@jgengine/core/store/defineStore";
import type { Team } from "../arena/geometry";
import { createCraterFieldState, type CraterFieldState } from "../craters/craterField";
import { DEFAULT_DIFFICULTY, type DifficultyId } from "./difficulty";
import type { MatchPhase } from "./matchState";

export interface ChargeSlotView {
  armed: boolean;
  fuseFraction: number;
}

export interface MatchSnapshot {
  started: boolean;
  phase: MatchPhase;
  scoreCyan: number;
  scoreMagenta: number;
  clockSeconds: number;
  kickoffTimer: number;
  kickoffCount: number;
  overtimeSeconds: number;
  craterCount: number;
  craterScars: number;
  longestGoalBlastDistance: number;
  lastGoalTeam: Team | null;
  difficulty: DifficultyId;
  cyanCharges: readonly [ChargeSlotView, ChargeSlotView];
  magentaCharges: readonly [ChargeSlotView, ChargeSlotView];
  announcerLine: string;
  announcerId: number;
  dodgeFraction: number;
}

export const EMPTY_CHARGE_VIEW: ChargeSlotView = { armed: false, fuseFraction: 0 };

export function createIdleSnapshot(difficulty: DifficultyId): MatchSnapshot {
  return {
    started: false,
    phase: "kickoff",
    scoreCyan: 0,
    scoreMagenta: 0,
    clockSeconds: 0,
    kickoffTimer: 0,
    kickoffCount: 0,
    overtimeSeconds: 0,
    craterCount: 0,
    craterScars: 0,
    longestGoalBlastDistance: 0,
    lastGoalTeam: null,
    difficulty,
    cyanCharges: [EMPTY_CHARGE_VIEW, EMPTY_CHARGE_VIEW],
    magentaCharges: [EMPTY_CHARGE_VIEW, EMPTY_CHARGE_VIEW],
    announcerLine: "",
    announcerId: 0,
    dodgeFraction: 1,
  };
}

export const matchStore = defineStore<MatchSnapshot>("match", () => createIdleSnapshot(DEFAULT_DIFFICULTY));

export const craterStore = defineStore<CraterFieldState>("craters", () => createCraterFieldState());

export const difficultyStore = defineStore<DifficultyId>("selectedDifficulty", DEFAULT_DIFFICULTY);
