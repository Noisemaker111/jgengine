import { createPairKeyCodec } from "@jgengine/core/relation/keyedValues";
import type { NoticeFeed, NoticeTone } from "@jgengine/core/notifications/notices";

import type { AlienBodyPlan } from "../creatures/bodyPlan";
import type { ResourceLedger } from "@jgengine/core/economy/resourceLedger";
import type { StandingState } from "@jgengine/core/progression/standing";
import type { UpgradeState } from "@jgengine/core/progression/upgrades";
import { createHouseholdEconomy } from "../sim/economy";

import type { NeedId } from "../needs/needs";
import type { TraitId } from "../traits";
import type { StorytellerState } from "@jgengine/core/ai/director/storyteller";

export type MemberAction =
  | { kind: "idle" }
  | { kind: "wander"; x: number; z: number; company?: string }
  | { kind: "seek"; goal: NeedId | "work"; objId: string }
  | { kind: "use"; goal: NeedId | "work"; objId: string }
  | { kind: "social"; withId: string };

export const BLOOM_CROPS = ["pantry", "export"] as const;
export type BloomCrop = (typeof BLOOM_CROPS)[number];

/** The two lifestyles, and their one list: the save decoder reads this, never a copy. */
export const LIFESTYLES = ["yield", "bloom"] as const;
export type Lifestyle = (typeof LIFESTYLES)[number];

export interface MemberState {
  id: string;
  name: string;
  bodyPlan: AlienBodyPlan;
  job: string;
  needs: Record<NeedId, number>;
  action: MemberAction;
  assignedByPlayer: boolean;
  actionUntil: number;
  lifestyle: Lifestyle;
  bloomCrop?: BloomCrop;
  stress: number;
  recovering: boolean;
  workToday: number;
  harvestToday: number;
  shiftProgress: number;
  shiftDay: number;
  completedShifts: number;
  missedShifts: number;
  concern: string | null;
  traits?: TraitId[];
  /** Game seconds until a fever passes; needs drain faster and paid work stops while it runs. */
  illUntil?: number;
}

export interface CharterState {
  /** 0-based term the household is living in; 4 once the charter is complete. */
  term: number;
  strikes: number;
  stars: number[];
  termIncome: number;
  answered: number;
  outcome: "active" | "evicted" | "kept";
  review: TermReview | null;
  warned: boolean;
}

export interface TermReview {
  term: number;
  met: string[];
  missed: string[];
  grant: number;
  strike: boolean;
  outcome: CharterState["outcome"];
  /** Why the household was evicted, when it was. */
  reason?: string;
}

export interface PendingIncident {
  id: string;
  memberId: string | null;
  otherId: string | null;
  objId: string | null;
  /** The furnishing kind `objId` is, so the transmission can name it after a reload. */
  objCatalog: string | null;
  /** Game seconds when the default answer is taken. */
  deadline: number;
}

export interface HabitatHazards {
  consolesOfflineUntil: number;
  dustUntil: number;
  hullLeak: boolean;
  broken: string[];
}

export interface DaySummary {
  day: number;
  income: number;
  harvest: number;
  bill: number;
  missed: number;
}

export interface HouseholdState {
  seed: string;
  members: Record<string, MemberState>;
  order: string[];
  relationships: Record<string, number>;
  familiarity: Record<string, number>;
  credits: number;
  pantry: number;
  debt: number;
  day: number;
  economy: ResourceLedger;
  dayIncome: number;
  dayHarvest: number;
  reliefDay: number;
  lastDay: DaySummary | null;
  selectedMemberId: string | null;
  buildTool: string | null;
  eventSeq: number;
  standing?: StandingState;
  careers?: UpgradeState;
  /** Absent in saves from before the charter: such a household starts term one when loaded. */
  charter?: CharterState;
  story?: StorytellerState;
  incident?: PendingIncident | null;
  hazards?: HabitatHazards;
}

export function createCharter(): CharterState {
  return { term: 0, strikes: 0, stars: [], termIncome: 0, answered: 0, outcome: "active", review: null, warned: false };
}

export function createHazards(): HabitatHazards {
  return { consolesOfflineUntil: 0, dustUntil: 0, hullLeak: false, broken: [] };
}

const REL_KEY_CODEC = createPairKeyCodec();

export function pairKey(a: string, b: string): string {
  return REL_KEY_CODEC.key(a, b);
}

export function createHousehold(seed: string): HouseholdState {
  return {
    seed,
    members: {},
    order: [],
    relationships: {},
    familiarity: {},
    credits: 640,
    pantry: 12,
    debt: 0,
    day: 0,
    economy: createHouseholdEconomy(),
    dayIncome: 0,
    dayHarvest: 0,
    reliefDay: -1,
    lastDay: null,
    selectedMemberId: null,
    buildTool: null,
    eventSeq: 0,
    standing: { records: {} },
    careers: { ranks: {} },
    charter: createCharter(),
    incident: null,
    hazards: createHazards(),
  };
}

export function noteEvent(state: HouseholdState, notices: Pick<NoticeFeed, "push">, text: string, tone: NoticeTone = "info"): void {
  state.eventSeq += 1;
  notices.push({ text, tone });
}
