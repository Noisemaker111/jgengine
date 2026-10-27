import type { MissionDef } from "@jgengine/core/mission/mission";

import { MONTH_DAYS, monthLabel } from "./books";
import { DAY_LENGTH } from "./catalog";

/**
 * The park's scenarios as content: each is a `survive` mission that completes the moment every
 * target holds and fails when its months run out (or the crowd walks out). They unlock in order:
 * winning one opens the next. `park.ts` declares each one as a job on the park's world, so the
 * world's own mission runtime runs it and saves it with the park.
 */

export interface ScenarioTarget {
  /** The world fact the target reads. */
  fact: string;
  atLeast: number;
  /** How the HUD names it: "guests in the park". */
  label: string;
}

export interface ScenarioDef {
  id: string;
  title: string;
  blurb: string;
  /** What must be true by the deadline. */
  goal: string;
  /** Money the park opens with. */
  cash: number;
  /** Park months the scenario runs, from 1 March, Year 1. */
  months: number;
  targets: readonly ScenarioTarget[];
  /** The scenario a park must win before this one opens; none for the first. */
  after?: string;
  mission: MissionDef;
}

interface ScenarioSpec {
  id: string;
  title: string;
  blurb: string;
  cash: number;
  months: number;
  targets: readonly ScenarioTarget[];
  after?: string;
  reward: number;
}

/** A scenario's deadline in park seconds. */
export const scenarioSeconds = (months: number): number => months * MONTH_DAYS * DAY_LENGTH;

function scenario(spec: ScenarioSpec): ScenarioDef {
  const deadline = monthLabel(spec.months - 1);
  const goal = `${spec.targets.map((t) => `${t.atLeast.toLocaleString()} ${t.label}`).join(" and ")} by the end of ${deadline}`;
  return {
    id: spec.id,
    title: spec.title,
    blurb: spec.blurb,
    goal,
    cash: spec.cash,
    months: spec.months,
    targets: spec.targets,
    ...(spec.after === undefined ? {} : { after: spec.after }),
    mission: {
      id: spec.id,
      title: spec.title,
      description: `${goal}.`,
      fail: [
        { id: "walkout", message: "The crowd turned miserable and stopped coming." },
        { id: "short", message: `The end of ${deadline} came and the park was short of its target.` },
      ],
      objectives: [
        {
          id: "target",
          kind: "survive",
          label: goal,
          until: spec.targets.map((t) => ({ fact: t.fact, atLeast: t.atLeast })),
          timeout: scenarioSeconds(spec.months),
          onTimeout: "short",
          failOn: [{ kind: "fact", fact: "park.mood", atMost: 15, to: "walkout", message: "Guest mood collapsed below 15%." }],
        },
      ],
      rewards: { economy: { cash: spec.reward } },
    },
  };
}

export const SCENARIOS: readonly ScenarioDef[] = [
  scenario({
    id: "brightway_beginnings",
    title: "Brightway Beginnings",
    blurb: "An empty lot by the sea, a loan from the bank and one spring to prove the park can draw a crowd.",
    cash: 10_000,
    months: 3,
    targets: [
      { fact: "park.guests", atLeast: 120, label: "guests in the park" },
      { fact: "park.rating", atLeast: 400, label: "stars" },
    ],
    reward: 5_000,
  }),
  scenario({
    id: "star_attraction",
    title: "Star Attraction",
    blurb: "One whole season to build the coast's favourite day out.",
    cash: 10_000,
    months: 8,
    targets: [
      { fact: "park.rating", atLeast: 650, label: "stars" },
      { fact: "park.guests", atLeast: 250, label: "guests in the park" },
    ],
    after: "brightway_beginnings",
    reward: 10_000,
  }),
  scenario({
    id: "full_house",
    title: "Full House",
    blurb: "Two seasons to fill every path: the biggest crowd Brightway has ever seen.",
    cash: 10_000,
    months: 16,
    targets: [
      { fact: "park.guests", atLeast: 380, label: "guests in the park" },
      { fact: "park.rating", atLeast: 850, label: "stars" },
    ],
    after: "star_attraction",
    reward: 20_000,
  }),
];

/** The first scenario: a new game starts here. */
export const FIRST_SCENARIO = "brightway_beginnings";

export function scenarioDef(id: string): ScenarioDef | null {
  return SCENARIOS.find((entry) => entry.id === id) ?? null;
}

const WON_KEY = "brightway-park.scenarios-won";

/** The scenarios this browser has won, kept apart from any one park's save. */
export function scenariosWon(): readonly string[] {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(WON_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function recordScenarioWin(id: string): void {
  const won = scenariosWon();
  if (won.includes(id)) return;
  try {
    localStorage.setItem(WON_KEY, JSON.stringify([...won, id]));
  } catch { /* Browser storage may be disabled: the unlock lasts this session only. */ }
}

/** Why a scenario is still locked, or null when it can be played. */
export function scenarioLock(id: string): string | null {
  const def = scenarioDef(id);
  if (def === null) return "No such scenario";
  if (def.after === undefined || scenariosWon().includes(def.after)) return null;
  return `Win ${scenarioDef(def.after)?.title ?? "the one before"} first`;
}
