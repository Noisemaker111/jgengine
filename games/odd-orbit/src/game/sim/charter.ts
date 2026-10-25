import { evaluateObjectives, type ObjectiveSummary, type ThresholdObjective } from "@jgengine/core/game/objectives";
import type { NoticeFeed } from "@jgengine/core/game/notices";
import type { SceneObject } from "@jgengine/core/scene/objectStore";

import { householdBook } from "../agents";
import { careerView, rungIn } from "../careers";
import { FURNITURE_BY_ID } from "../objects/catalog";
import { TERM_RENT } from "./economy";
import { createCharter, noteEvent, type CharterState, type HouseholdState } from "../session/types";

/**
 * The Habitat Authority's charter: four terms of five days. Each term raises the base rent and sets
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
  | "termIncome" | "bestOpinion" | "pantry" | "savings";

export interface CharterGoal extends ThresholdObjective {
  id: string;
  metric: CharterMetric;
  label: string;
  /** What the player does about it, in the household's words. */
  hint: string;
}

export interface CharterTerm {
  name: string;
  /** Base habitat rent per night, before each furnishing's running cost. */
  rent: number;
  goals: readonly CharterGoal[];
}

export const TERMS: readonly CharterTerm[] = [
  { name: "Settling in", rent: TERM_RENT[0], goals: [
    { id: "t1-adept", metric: "rung2", target: 1, label: "Promote a being to Adept", hint: "Shifts earn standing; spend 3 in the inspector." },
    { id: "t1-station", metric: "stations", target: 3, label: "Furnish a third paid station", hint: "Buy a Yield Console or Bloom Planter." },
    { id: "t1-debt", metric: "debtFree", target: 1, label: "Close the term debt-free", hint: "Cover each midnight bill." },
  ] },
  { name: "Finding a rhythm", rent: TERM_RENT[1], goals: [
    { id: "t2-adepts", metric: "rung2", target: 3, label: "Three beings at Adept or better", hint: "Promote as standing allows." },
    { id: "t2-answer", metric: "answered", target: 3, label: "Answer three transmissions", hint: "Choose before the Authority chooses for you." },
    { id: "t2-income", metric: "termIncome", target: 1500, label: "Earn 1,500 credits this term", hint: "Higher rungs and export crops pay more." },
  ] },
  { name: "Putting down roots", rent: TERM_RENT[2], goals: [
    { id: "t3-close", metric: "bestOpinion", target: 70, label: "Two beings grow Close", hint: "Direct talks between a warm pair." },
    { id: "t3-furnish", metric: "furnishings", target: 10, label: "Ten furnishings in the habitat", hint: "Each one adds to the nightly running cost." },
    { id: "t3-pantry", metric: "pantry", target: 18, label: "Close the term with 18 rations", hint: "Pantry crops and a Green-fingered keeper help." },
  ] },
  { name: "Keeping the charter", rent: TERM_RENT[3], goals: [
    { id: "t4-bond", metric: "bestOpinion", target: 95, label: "A lifelong bond", hint: "A Close pair who keep talking." },
    { id: "t4-master", metric: "rung3", target: 1, label: "Promote a being to Master", hint: "Master takes 9 standing." },
    { id: "t4-savings", metric: "savings", target: 600, label: "600 credits saved, no debt", hint: "Rent is highest now; spend carefully." },
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
    noteEvent(state, notices, `The Habitat Authority has evicted the household: debt passed ${BAILIFF_DEBT} credits.`, "deny");
    return;
  }
  if (state.debt >= FINAL_NOTICE_DEBT && !charter.warned) {
    charter.warned = true;
    noteEvent(state, notices, `Final notice: debt is ${Math.round(state.debt)}. At ${BAILIFF_DEBT} the Authority evicts.`, "warn");
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
  const head = `Term ${term + 1} review: ${met.length} of ${goals.length} goals met, grant ${grant} credits`;
  if (charter.outcome === "evicted") noteEvent(state, notices, `${head}. Second strike — the household is evicted.`, "deny");
  else if (charter.outcome === "kept") noteEvent(state, notices, `${head}. The charter is kept.`, "success");
  else noteEvent(state, notices, `${head}${strike ? " — a strike" : ""}. Rent rises to ${TERMS[charter.term]!.rent}.`, strike ? "warn" : "success");
}

/** Total goals met across closed terms, out of twelve, and the Authority's word for it. */
export function charterGrade(charter: CharterState): { stars: number; of: number; word: string } {
  const stars = charter.stars.reduce((sum, n) => sum + n, 0);
  const of = TERMS.length * 3;
  const word = stars >= 10 ? "Cherished" : stars >= 7 ? "Welcome" : "Tolerated";
  return { stars, of, word };
}
