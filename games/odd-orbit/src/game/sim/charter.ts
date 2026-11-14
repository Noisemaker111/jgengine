import { evaluateObjectives, type ObjectiveSummary, type ThresholdObjective } from "@jgengine/core/mission/objectives";
import type { NoticeFeed } from "@jgengine/core/notifications/notices";
import type { SceneObject } from "@jgengine/core/scene/objectStore";

import { householdBook } from "../agents";
import { careerView, rungIn } from "../careers";
import { FURNITURE_BY_ID } from "../objects/catalog";
import { TERM_RENT } from "./economy";
import { createCharter, noteEvent, type CharterState, type HouseholdState } from "../session/types";
import { boardingOf, DEED_PRICE, roomOf, tenantComfort } from "../boarding/boarding";

/**
 * The Dockmaster's lease on the boarding house's berth: four terms of five days. Each term raises the base rent and sets
 * three goals; a review at the term's last midnight pays a grant per goal met and gives a strike
 * when fewer than two were met. Two strikes, or debt past the bailiff line, end the charter in
 * eviction; four terms with at most one strike keep it.
 */
export const TERM_DAYS = 5;
export const GOALS_TO_PASS = 2;
export const STRIKES_TO_EVICT = 2;
export const GRANT_PER_GOAL = 60;
/** Debt at or past this at any midnight evicts the household. */
export const BAILIFF_DEBT = 300;
/** Debt at or past this draws the Authority's final notice. */
export const FINAL_NOTICE_DEBT = 150;

export type CharterMetric =
  | "rung2" | "rung3" | "stations" | "furnishings" | "debtFree" | "answered"
  | "termIncome" | "bestOpinion" | "pantry" | "savings"
  | "comfy" | "housed" | "reputation" | "modules" | "deedPaid";

export interface CharterGoal extends ThresholdObjective {
  id: string;
  metric: CharterMetric;
  label: string;
  /** What the player does about it, in the household's words. */
  hint: string;
}

export interface CharterTerm {
  name: string;
  /** Base docking fee per night, before each furnishing's and module's running cost. */
  rent: number;
  goals: readonly CharterGoal[];
}

export const TERMS: readonly CharterTerm[] = [
  { name: "Grand reopening", rent: TERM_RENT[0], goals: [
    { id: "t1-comfy", metric: "comfy", target: 4, label: "Four tenants comfortable at once", hint: "Give Pip-9 a door or let an applicant in, then fix what they grumble about." },
    { id: "t1-station", metric: "stations", target: 3, label: "Furnish a third paid station", hint: "Buy a Gig Terminal or a Hydro Tray." },
    { id: "t1-debt", metric: "debtFree", target: 1, label: "Close the term debt-free", hint: "Rent night comes before the docking bill." },
  ] },
  { name: "Word gets around", rent: TERM_RENT[1], goals: [
    { id: "t2-housed", metric: "housed", target: 5, label: "Five tenants with a door of their own", hint: "Let an applicant in, or give Pip-9 a room." },
    { id: "t2-answer", metric: "answered", target: 3, label: "Handle three front-desk calls", hint: "Choose before the house shrugs for you." },
    { id: "t2-rep", metric: "reputation", target: 55, label: "Station reputation 55", hint: "Comfortable tenants write kind reviews." },
  ] },
  { name: "Bolting on", rent: TERM_RENT[2], goals: [
    { id: "t3-module", metric: "modules", target: 5, label: "Bolt on a fifth module", hint: "Buy a berth from the Rooms plan." },
    { id: "t3-close", metric: "bestOpinion", target: 70, label: "Two tenants grow close", hint: "Kind walls and lounge chats." },
    { id: "t3-income", metric: "termIncome", target: 1500, label: "Take in 1,500 credits this term", hint: "Rent, gigs and harvests all count." },
  ] },
  { name: "Lease renewal", rent: TERM_RENT[3], goals: [
    { id: "t4-bond", metric: "bestOpinion", target: 95, label: "A lifelong bond", hint: "A close pair who keep talking." },
    { id: "t4-rep", metric: "reputation", target: 78, label: "Station reputation 78", hint: "Every tenant comfortable, nightly." },
    { id: "t4-deed", metric: "deedPaid", target: 3000, label: "Pay off half the deed (3,000)", hint: "Pay toward the deed from the Rooms plan." },
  ] },
];

export function charterOf(state: HouseholdState): CharterState {
  return state.charter ?? createCharter();
}

export function termOf(state: HouseholdState): CharterTerm {
  return TERMS[Math.min(TERMS.length - 1, charterOf(state).term)]!;
}

export function metricValue(state: HouseholdState, objects: readonly SceneObject[], metric: CharterMetric): number {
  const charter = charterOf(state);
  switch (metric) {
    case "rung2":
    case "rung3": {
      const view = careerView(state);
      const floor = metric === "rung2" ? 2 : 3;
      return state.order.filter((id) => { const m = state.members[id]; return m !== undefined && rungIn(view, m) >= floor; }).length;
    }
    case "stations": return objects.filter((o) => o.catalogId === "work_console" || o.catalogId === "bloom_planter").length;
    case "furnishings": return objects.filter((o) => FURNITURE_BY_ID[o.catalogId] !== undefined).length;
    case "debtFree": return state.debt > 0 ? 0 : 1;
    case "answered": return charter.answered;
    case "termIncome": return Math.floor(charter.termIncome + state.dayIncome);
    case "bestOpinion": {
      const book = householdBook(state);
      let best = -100;
      for (const a of state.order) for (const b of state.order) if (a < b) best = Math.max(best, book.opinion(a, b));
      return Math.round(best);
    }
    case "pantry": return state.pantry;
    case "savings": return state.debt > 0 ? 0 : Math.floor(state.credits);
    case "comfy": return state.order.filter((id) => roomOf(state, id) !== null && tenantComfort(state, id).score >= 55).length;
    case "housed": return state.order.filter((id) => roomOf(state, id) !== null).length;
    case "reputation": return Math.floor(boardingOf(state).reputation);
    case "modules": return boardingOf(state).rooms.length;
    case "deedPaid": return Math.floor(DEED_PRICE - boardingOf(state).deedOwed);
  }
}

/** The live goal sheet for the current term, as the charter panel reads it. */
export function termGoals(state: HouseholdState, objects: readonly SceneObject[]): ObjectiveSummary & { goals: readonly CharterGoal[] } {
  const goals = termOf(state).goals;
  const byId = new Map(goals.map((goal) => [goal.id, goal]));
  return { ...evaluateObjectives(goals, (id) => metricValue(state, objects, byId.get(id)!.metric)), goals };
}

/** Day index (0-based) of the review midnight that closes the current term. */
export function termEndDay(state: HouseholdState): number {
  return (charterOf(state).term + 1) * TERM_DAYS;
}

/**
 * Run after a midnight settles. Applies the bailiff line, then closes the term when its last day
 * has passed: grant, stars, strike, and the charter's outcome.
 */
export function reviewCharter(state: HouseholdState, objects: readonly SceneObject[], closedDayIncome: number, notices: Pick<NoticeFeed, "push">): void {
  const charter = { ...charterOf(state) };
  state.charter = charter;
  if (charter.outcome !== "active") return;
  charter.termIncome += closedDayIncome;
  if (state.debt >= BAILIFF_DEBT) {
    charter.outcome = "evicted";
    charter.review = { term: charter.term, met: [], missed: [], grant: 0, strike: true, outcome: "evicted", reason: `Debt reached ${Math.round(state.debt)} credits; the bailiff line is ${BAILIFF_DEBT}.` };
    noteEvent(state, notices, `The Dockmaster has cut the house loose: debt passed ${BAILIFF_DEBT} credits.`, "deny");
    return;
  }
  if (state.debt >= FINAL_NOTICE_DEBT && !charter.warned) {
    charter.warned = true;
    noteEvent(state, notices, `Final notice from the Dockmaster: debt is ${Math.round(state.debt)}. At ${BAILIFF_DEBT} the berth is repossessed.`, "warn");
  }
  if (state.debt < FINAL_NOTICE_DEBT) charter.warned = false;
  if (state.day < termEndDay(state)) return;
  const sheet = evaluateObjectives(termOf(state).goals, (id) => {
    const goal = termOf(state).goals.find((g) => g.id === id)!;
    return goal.metric === "termIncome" ? Math.floor(charter.termIncome) : metricValue(state, objects, goal.metric);
  });
  const goals = termOf(state).goals;
  const met = sheet.statuses.filter((s) => s.met).map((s) => goals.find((g) => g.id === s.id)!.label);
  const missed = sheet.statuses.filter((s) => !s.met).map((s) => goals.find((g) => g.id === s.id)!.label);
  const grant = met.length * GRANT_PER_GOAL;
  const strike = met.length < GOALS_TO_PASS;
  state.credits += grant;
  charter.stars = [...charter.stars, met.length];
  if (strike) charter.strikes += 1;
  const term = charter.term;
  charter.term += 1;
  charter.termIncome = 0;
  charter.answered = 0;
  if (charter.strikes >= STRIKES_TO_EVICT) charter.outcome = "evicted";
  else if (charter.term >= TERMS.length) charter.outcome = "kept";
  charter.review = {
    term, met, missed, grant, strike, outcome: charter.outcome,
    ...(charter.outcome === "evicted" ? { reason: `Two terms closed with fewer than ${GOALS_TO_PASS} goals met.` } : {}),
  };
  const head = `Lease review ${term + 1}: ${met.length} of ${goals.length} goals met, grant ${grant} credits`;
  if (charter.outcome === "evicted") noteEvent(state, notices, `${head}. Second strike — the berth is repossessed.`, "deny");
  else if (charter.outcome === "kept") noteEvent(state, notices, `${head}. The lease is renewed.`, "success");
  else noteEvent(state, notices, `${head}${strike ? " — a strike" : ""}. Docking fees rise to ${TERMS[charter.term]!.rent}.`, strike ? "warn" : "success");
}

/** Total goals met across closed terms, out of twelve, and the Dockmaster's word for it. */
export function charterGrade(charter: CharterState): { stars: number; of: number; word: string } {
  const stars = charter.stars.reduce((sum, n) => sum + n, 0);
  const of = TERMS.length * 3;
  const word = stars >= 10 ? "Five-star" : stars >= 7 ? "Well-reviewed" : "Tolerated";
  return { stars, of, word };
}
