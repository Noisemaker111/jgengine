import type { ReputationTier } from "@jgengine/core/faction/reputation";
import { createGateSet, gateFacts, type GateDef, type GateStatus } from "@jgengine/core/progression/gates";
import { createStanding, type Standing, type StandingState } from "@jgengine/core/progression/standing";
import { createUpgradeTree, type UpgradeState } from "@jgengine/core/progression/upgrades";

import { householdBook } from "./agents";
import { JOBS } from "./entities/aliens/catalog";
import { WORK_EARN_PER_SECOND } from "./objects/catalog";
import { bloomHarvest } from "./sim/bloom";
import type { BloomCrop, HouseholdState, Lifestyle, MemberState } from "./session/types";

/** The household's two paid stations. A post is native to one of them, or to both. */
export type StationKind = "yield" | "bloom";

export const STATION_LABEL: Record<StationKind, string> = { yield: "Yield Console", bloom: "Bloom Planter" };
export const STATION_NAME: Record<StationKind, string> = { yield: "Yield", bloom: "Bloom" };

/** A post is one of the household's existing jobs; the ladder is what the job grows into. */
export type CareerId = (typeof JOBS)[number];

export interface CareerDef {
  id: CareerId;
  label: string;
  /** The station this post calls its own; `either` covers both from the first rung. */
  station: StationKind | "either";
  /** Standing on the household track that opens the post on the board. */
  postGate: number;
  /** Pay factor at each rung on the post's own station. */
  native: readonly [number, number, number];
  /** Pay factor when a cross-trained being covers the other station (rung 1 cannot). */
  cover: readonly [number, number, number];
  /** Extra ration crystals at each rung when this post brings in a Bloom harvest. */
  rations: readonly [number, number, number];
  blurb: string;
}

/**
 * Authored posts. Rung 1 is the day-one post; rungs 2 and 3 are bought with household standing,
 * never credits, so a shift is the only wage that opens a ladder.
 */
export const CAREERS: readonly CareerDef[] = [
  { id: "Botanist", label: "Botanist", station: "bloom", postGate: 0, native: [1, 1.15, 1.35], cover: [0, 0.9, 1], rations: [0, 0, 1], blurb: "Tends the planter. A Master Botanist adds a ration to every harvest." },
  { id: "Signal-keeper", label: "Signal-keeper", station: "yield", postGate: 0, native: [1, 1.15, 1.35], cover: [0, 0.9, 1], rations: [0, 0, 0], blurb: "The console post. Adept Signal-keepers may cover the planter between shifts." },
  { id: "Forager", label: "Forager", station: "bloom", postGate: 3, native: [1, 1.1, 1.25], cover: [0, 0.85, 0.95], rations: [0, 1, 1], blurb: "Turns the planter toward food instead of credits." },
  { id: "Tinkerer", label: "Tinkerer", station: "yield", postGate: 6, native: [1, 1.1, 1.25], cover: [0, 0.85, 0.95], rations: [0, 0, 0], blurb: "Keeps the consoles earning through small repairs." },
  { id: "Archivist", label: "Archivist", station: "yield", postGate: 10, native: [1, 1.2, 1.4], cover: [0, 0.9, 1], rations: [0, 0, 0], blurb: "The best console wage in the habitat, for a household with standing." },
  { id: "Warden", label: "Warden", station: "either", postGate: 14, native: [0.9, 1, 1.1], cover: [0.9, 1, 1.1], rations: [0, 0, 1], blurb: "Covers either station from the first rung, at a steadier wage." },
];

const CAREER_BY_ID = new Map(CAREERS.map((career) => [career.id, career]));

/** Rung names, shared by every ladder: rung 1 is the post as it starts. */
export const RUNG_NAMES = ["Hand", "Adept", "Master"] as const;
export const RUNG_MARKS = ["I", "II", "III"] as const;
export type Rung = 1 | 2 | 3;

/** The two default posts a rhythm switches to; both open at zero standing. */
export const DEFAULT_POST: Record<Lifestyle, CareerId> = { yield: "Signal-keeper", bloom: "Botanist" };

/** Mastery tiers per station: a being's shift count crosses a level at each min. */
export const MASTERY_TIERS: readonly ReputationTier[] = [
  { id: "novice", min: 0, relation: "neutral" },
  { id: "practised", min: 1, relation: "neutral" },
  { id: "skilled", min: 4, relation: "friendly" },
  { id: "expert", min: 8, relation: "friendly" },
  { id: "master", min: 12, relation: "friendly" },
];

export const MASTERY_LABEL: Record<string, string> = {
  novice: "I", practised: "II", skilled: "III", expert: "IV", master: "V",
};

/** +5% pay for every mastery level above the first. */
export const MASTERY_PAY_PER_LEVEL = 0.05;

/** One standing ledger serves mastery (per station) and the post ladder (household). */
export const ORBIT_STANDING = {
  tracks: [
    { id: "yield", label: "Yield mastery", initial: 0, min: 0, max: 999, tiers: MASTERY_TIERS },
    { id: "bloom", label: "Bloom mastery", initial: 0, min: 0, max: 999, tiers: MASTERY_TIERS },
    {
      id: "orbit",
      label: "Household standing",
      initial: 0,
      min: -99,
      max: 999,
      tiers: [
        { id: "newcomer", min: 0, relation: "neutral" as const },
        { id: "steady", min: 4, relation: "friendly" as const },
        { id: "trusted", min: 12, relation: "friendly" as const },
        { id: "fixture", min: 24, relation: "friendly" as const },
      ],
    },
  ],
  outcomes: [
    { id: "shift:yield", label: "Worked a Yield shift", impacts: { yield: 1, orbit: 1 } },
    { id: "shift:bloom", label: "Worked a Bloom shift", impacts: { bloom: 1, orbit: 1 } },
    { id: "missed", label: "Missed a paid shift", impacts: { orbit: -1 } },
  ],
} as const;

/** Standing every post's gate reads. */
export const STANDING_TRACKS = ["yield", "bloom", "orbit"] as const;

/** The board of posts: a post opens at authored household standing, checked against live facts. */
export const CAREER_BOARD = createGateSet({
  gates: CAREERS.map((career) => ({
    id: `post:${career.id}`,
    unlock: career.id,
    label: career.label,
    requires: career.postGate === 0 ? {} : { standing: { trackId: "orbit", min: career.postGate } },
  })),
  catalog: { has: (id) => CAREER_BY_ID.has(id as CareerId) },
  standing: createStanding({ tracks: ORBIT_STANDING.tracks, outcomes: ORBIT_STANDING.outcomes }),
});

/** Node ids for rungs 2 and 3 of one post. Rung 1 is the post itself, never bought. */
export function rungNode(career: CareerId, rung: 2 | 3): string {
  return `post:${career}:${rung}`;
}

/** Every rung node, in one place so a save can validate the ranks it stores. */
export const CAREER_NODES = CAREERS.flatMap((career) => [
  { id: rungNode(career.id, 2), label: `${career.label} ${RUNG_NAMES[1]}`, cost: { kind: "const", value: 0 } as const, maxRank: 1, standing: { trackId: "orbit", min: 3 } },
  { id: rungNode(career.id, 3), label: `${career.label} ${RUNG_NAMES[2]}`, cost: { kind: "const", value: 0 } as const, maxRank: 1, requires: [rungNode(career.id, 2)], standing: { trackId: "orbit", min: 9 } },
]);

export const CAREER_NODE_IDS: ReadonlySet<string> = new Set(CAREER_NODES.map((node) => node.id));

/** Live handles over a save's standing records, post rungs and the ladder they gate. */
export interface CareerView {
  standing: Standing;
  tree: ReturnType<typeof createUpgradeTree>;
}

export function careerView(state: HouseholdState): CareerView {
  const standing = createStanding({ tracks: ORBIT_STANDING.tracks, outcomes: ORBIT_STANDING.outcomes });
  if (state.standing !== undefined) standing.restore(state.standing);
  const tree = createUpgradeTree({ nodes: CAREER_NODES, standing, state: state.careers ?? { ranks: {} } });
  return { standing, tree };
}

export function careerById(id: string): CareerDef | null {
  return CAREER_BY_ID.get(id as CareerId) ?? null;
}

/** A being's post. Older saves stored any of `JOBS`; every job has a post. */
export function careerOf(member: MemberState): CareerDef {
  const career = careerById(member.job);
  if (career !== null) return career;
  return CAREER_BY_ID.get(DEFAULT_POST.yield)!;
}

export function rungIn(view: CareerView, member: MemberState): Rung {
  const career = careerOf(member);
  if (view.tree.rank(rungNode(career.id, 3)) > 0) return 3;
  if (view.tree.rank(rungNode(career.id, 2)) > 0) return 2;
  return 1;
}

/** The station a post calls its own, or the one an `either` post is working now. */
export function stationOf(member: MemberState): StationKind {
  const career = careerOf(member);
  return career.station === "either" ? (member.lifestyle === "bloom" ? "bloom" : "yield") : career.station;
}

export function stationCovers(career: CareerDef, station: StationKind): boolean {
  return career.station === "either" || career.station === station;
}

export interface StationCoverage {
  ok: boolean;
  /** Why a being cannot take this station; empty when they can. */
  reason: string;
}

/** Whether a being can take a station at all: their post, or the other station once cross-trained. */
export function coverageOf(view: CareerView, member: MemberState, station: StationKind): StationCoverage {
  const career = careerOf(member);
  if (stationCovers(career, station)) return { ok: true, reason: "" };
  const rung = rungIn(view, member);
  if (rung >= 2) return { ok: true, reason: "" };
  return {
    ok: false,
    reason: `${member.name} holds the ${career.label} post and cannot cover the ${STATION_LABEL[station]} yet; reach rung 2 (Adept) or take a post in that station's family`,
  };
}

export interface StationPay {
  career: CareerDef;
  rung: Rung;
  /** True when the station is the post's own. */
  native: boolean;
  careerFactor: number;
  masteryLevel: number;
  masteryLabel: string;
  masteryFactor: number;
  /** Career and mastery multiplied; 0 when the being cannot take the station. */
  factor: number;
  /** Extra ration crystals this post brings to a Bloom harvest at this rung. */
  rations: number;
  /** Shifts worked at this station, the number mastery is read from. */
  shifts: number;
}

/** What one being is paid on one station, from their post rung, mastery and shift count. */
export function stationPayIn(view: CareerView, member: MemberState, station: StationKind): StationPay {
  const career = careerOf(member);
  const rung = rungIn(view, member);
  const native = stationCovers(career, station);
  // A being from an older save already pointed at the other station works it at the base rate:
  // the post premium and its rations are what a career buys, and an order will ask for a rung first.
  const careerFactor = native ? career.native[rung - 1] : rung === 1 ? 1 : career.cover[rung - 1];
  const tier = view.standing.tier(member.id, station);
  const level = Math.max(1, MASTERY_TIERS.findIndex((entry) => entry.id === tier.id) + 1);
  const masteryFactor = 1 + MASTERY_PAY_PER_LEVEL * (level - 1);
  return {
    career, rung, native, careerFactor,
    masteryLevel: level,
    masteryLabel: MASTERY_LABEL[tier.id] ?? "I",
    masteryFactor,
    factor: Math.round(careerFactor * masteryFactor * 1000) / 1000,
    rations: station === "bloom" ? career.rations[rung - 1] : 0,
    shifts: view.standing.standing(member.id, station),
  };
}

export function stationPay(state: HouseholdState, member: MemberState, station: StationKind): StationPay {
  return stationPayIn(careerView(state), member, station);
}

/** A Bloom harvest with the being's post and mastery applied; the base crop stays the game's. */
export function bloomHarvestIn(view: CareerView, member: MemberState, crop: BloomCrop, friend: boolean): { rations: number; credits: number } {
  const base = bloomHarvest(crop, friend);
  const pay = stationPayIn(view, member, "bloom");
  return {
    rations: base.rations + pay.rations,
    credits: Math.round(base.credits * pay.factor * 100) / 100,
  };
}

/** Credits one second of Yield console work pays this being. */
export function yieldRateIn(view: CareerView, member: MemberState): number {
  const pay = stationPayIn(view, member, "yield");
  return pay.factor <= 0 ? 0 : WORK_EARN_PER_SECOND * pay.factor;
}

/** Credits a full Yield shift pays, as the inspector previews it. */
export const YIELD_SHIFT_SECONDS = 20;

export function yieldShiftValue(state: HouseholdState, member: MemberState): number {
  return Math.round(yieldRateIn(careerView(state), member) * YIELD_SHIFT_SECONDS * 100) / 100;
}

/** Rung the being can buy next, and what it still needs. */
export interface RungProgress {
  career: CareerDef;
  rung: Rung;
  nextRung: 2 | 3 | null;
  nextLabel: string | null;
  /** Household standing the next rung needs. */
  needs: number | null;
  /** Household standing now. */
  have: number;
  canPromote: boolean;
  reason: string;
}

export function rungProgressIn(view: CareerView, member: MemberState): RungProgress {
  const career = careerOf(member);
  const rung = rungIn(view, member);
  const have = view.standing.standing(member.id, "orbit");
  const nextRung: 2 | 3 | null = rung === 1 ? 2 : rung === 2 ? 3 : null;
  const needs = nextRung === null ? null : CAREER_NODES.find((node) => node.id === rungNode(career.id, nextRung))!.standing.min;
  const buy = nextRung === null ? null : view.tree.canBuy(rungNode(career.id, nextRung), member.id);
  return {
    career, rung, nextRung,
    nextLabel: nextRung === null ? null : RUNG_NAMES[nextRung - 1]!,
    needs, have,
    canPromote: buy !== null && buy.ok,
    reason: nextRung === null
      ? `${career.label} is already a ${RUNG_NAMES[2]} post`
      : have < needs!
        ? `${needs! - have} more household standing needed`
        : `${career.label} ${RUNG_NAMES[nextRung - 1]} is open`,
  };
}

export function rungProgress(state: HouseholdState, member: MemberState): RungProgress {
  return rungProgressIn(careerView(state), member);
}

/** Buy the next rung of the being's post. Returns the reason when the ladder refuses. */
export function promote(state: HouseholdState, member: MemberState): { ok: boolean; reason: string; rung: Rung } {
  const view = careerView(state);
  const progress = rungProgressIn(view, member);
  if (progress.nextRung === null) return { ok: false, reason: progress.reason, rung: progress.rung };
  const bought = view.tree.buy(rungNode(progress.career.id, progress.nextRung), member.id, () => true);
  if (!bought.ok) return { ok: false, reason: progress.reason, rung: progress.rung };
  state.careers = view.tree.snapshot();
  return { ok: true, reason: `${progress.career.label} ${RUNG_NAMES[progress.nextRung - 1]}`, rung: progress.nextRung };
}

/** A post on the board, with why it is closed, for the inspector's post list. */
export interface PostRow {
  career: CareerDef;
  current: boolean;
  open: boolean;
  needs: number | null;
  missing: GateStatus["missing"];
}

export function postRows(state: HouseholdState, member: MemberState): PostRow[] {
  const view = careerView(state);
  const facts = gateFacts(view.standing, member.id);
  const current = careerOf(member);
  return CAREERS.map((career) => {
    const gate = CAREER_BOARD.gate(`post:${career.id}`);
    const status = gate === null ? undefined : CAREER_BOARD.status(facts).find((entry) => entry.gate.id === gate.id);
    return {
      career,
      current: career.id === current.id,
      open: status === undefined || status.open,
      needs: career.postGate === 0 ? null : career.postGate,
      missing: status?.missing ?? [],
    };
  });
}

/** Whether the post's board gate is open for this being. */
export function postOpen(state: HouseholdState, member: MemberState, career: CareerDef): boolean {
  return postRows(state, member).find((row) => row.career.id === career.id)?.open ?? false;
}

/**
 * A bonded pair will not take separate posts: two StationKind families never share a shift, so the
 * bond refuses the move before a career order can split them. `either` posts sit with anyone.
 */
export function careerSplitBlocker(state: HouseholdState, member: MemberState, next: CareerDef): string | null {
  const partnerId = householdBook(state).bondedWith(member.id);
  if (partnerId === null) return null;
  const partner = state.members[partnerId];
  if (partner === undefined) return null;
  const theirs = careerOf(partner);
  if (next.station === "either" || theirs.station === "either" || next.station === theirs.station) return null;
  return `${member.name} and ${partner.name} are bonded and will not take separate posts; the ${next.label} and ${theirs.label} never share a shift. Post both in one station's family, or take a Warden post that covers either.`;
}

/** The post a rhythm switch takes up when the current post cannot cover the new station. */
export function postForLifestyle(lifestyle: Lifestyle): CareerDef {
  return CAREER_BY_ID.get(DEFAULT_POST[lifestyle])!;
}

/** A save written before careers has standing records absent; align each post with its rhythm. */
export function alignLegacyPosts(state: HouseholdState): boolean {
  let changed = false;
  for (const id of state.order) {
    const member = state.members[id];
    if (member === undefined) continue;
    const career = careerOf(member);
    if (career.station !== "either" && career.station !== member.lifestyle) {
      member.job = DEFAULT_POST[member.lifestyle];
      changed = true;
    }
  }
  return changed;
}

export type CareerSave = { standing: StandingState; careers: UpgradeState };
