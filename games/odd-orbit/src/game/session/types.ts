import { createPairKeyCodec } from "@jgengine/core/relation/keyedValues";
import type { NoticeFeed, NoticeTone } from "@jgengine/core/game/notices";

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

/** The crops a bloom-lifestyle being can plant, and their one list. */
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
  /** The shared agent's need values, saved as plain numbers the HUD and the loop both read. */
  needs: Record<NeedId, number>;
  action: MemberAction;
  assignedByPlayer: boolean;
  actionUntil: number;
  lifestyle: Lifestyle;
  /** Absent in legacy v1 saves: pantry crops preserve their original harvest. */
  bloomCrop?: BloomCrop;
  stress: number;
  recovering: boolean;
  workToday: number;
  harvestToday: number;
  shiftProgress: number;
  /** Published from the shift session loop: the day whose shift closed, -1 before any. */
  shiftDay: number;
  completedShifts: number;
  missedShifts: number;
  concern: string | null;
  /** Two traits from the trait book; absent in saves from before traits. */
  traits?: TraitId[];
  /** Game seconds until a fever passes; needs drain faster and paid work stops while it runs. */
  illUntil?: number;
}

/** The household's standing with the Habitat Authority over the charter's four terms. */
export interface CharterState {
  /** 0-based term the household is living in; 4 once the charter is complete. */
  term: number;
  strikes: number;
  /** Goals met at each closed term's review. */
  stars: number[];
  /** Credits earned since this term opened. */
  termIncome: number;
  /** Transmissions the player answered this term (a default answer does not count). */
  answered: number;
  outcome: "active" | "evicted" | "kept";
  /** The last review the household has not dismissed yet. */
  review: TermReview | null;
  /** True once the Authority has warned that debt is near eviction. */
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

/** A transmission waiting on the player's answer. */
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

/** Trouble still running in the habitat. */
export interface HabitatHazards {
  /** Yield Consoles stop paying until this time. */
  consolesOfflineUntil: number;
  /** Bloom harvests lose a ration until this time. */
  dustUntil: number;
  /** Torpor Pods restore half as fast until mended. */
  hullLeak: boolean;
  /** Furnishings out of service until repaired. */
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
  /** Opinion per pair, from the shared relationship book. */
  relationships: Record<string, number>;
  /** How much time each pair has shared; a bond needs this as well as opinion. */
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
  /** Household notices raised so far; seeds incident rolls. */
  eventSeq: number;
  /** Per-being standing: shift counts per station and the household standing rungs read. */
  standing?: StandingState;
  /** Post rungs bought so far; absent in legacy v1 saves. */
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

/** Undirected, delimiter-safe key for a member pair; order-independent and serializable. */
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

/** Raise a household notice in the shell feed and count it toward the life-event seed. */
export function noteEvent(state: HouseholdState, notices: Pick<NoticeFeed, "push">, text: string, tone: NoticeTone = "info"): void {
  state.eventSeq += 1;
  notices.push({ text, tone });
}
