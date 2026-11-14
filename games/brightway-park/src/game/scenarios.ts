import type { MissionDef } from "@jgengine/core/mission/mission";

import { MONTH_DAYS, monthLabel } from "./books";
import { DAY_LENGTH } from "./catalog";

/**
 * The haunt's season as content: each scenario is a `survive` mission that completes the moment
 * every target holds and fails when its moons run out (or the living lose interest). They unlock in
 * order, ending in the Full Moon Festival: winning one opens the next. `park.ts` declares each one
 * as a job on the park's world, so the world's own mission runtime runs it and saves it.
 */

export interface ScenarioTarget {
  /** The world fact the target reads. */
  fact: string;
  atLeast: number;
  /** How the HUD names it: "of the living driven out screaming". */
  label: string;
}

export interface ScenarioDef {
  id: string;
  title: string;
  blurb: string;
  /** What must be true by the deadline. */
  goal: string;
  /** Ectoplasm the haunt wakes with. */
  cash: number;
  /** Moons the scenario runs, from the first night of the Harvest Moon. */
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
  const goal = `${spec.targets.map((t) => `${t.atLeast.toLocaleString()} ${t.label}`).join(", ")} by the end of ${deadline}`;
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
        { id: "walkout", message: "The living got bored of a haunt that couldn't scare them, and stopped coming." },
        { id: "short", message: `The end of ${deadline} came and the haunt was short of its target.` },
      ],
      objectives: [
        {
          id: "target",
          kind: "survive",
          label: goal,
          until: spec.targets.map((t) => ({ fact: t.fact, atLeast: t.atLeast })),
          timeout: scenarioSeconds(spec.months),
          onTimeout: "short",
          failOn: [{ kind: "fact", fact: "park.mood", atMost: 15, to: "walkout", message: "The living's mood collapsed below 15%." }],
        },
      ],
      rewards: { economy: { cash: spec.reward } },
    },
  };
}

export const SCENARIOS: readonly ScenarioDef[] = [
  scenario({
    id: "first_chill",
    title: "The First Chill",
    blurb: "A derelict pier, a debt to the Ferryman and three moons to send the living home screaming and lure your first ghost.",
    cash: 10_000,
    months: 3,
    targets: [
      { fact: "park.screams", atLeast: 60, label: "of the living driven out screaming" },
      { fact: "park.rating", atLeast: 300, label: "rumor" },
      { fact: "park.ghosts", atLeast: 1, label: "ghost in residence" },
    ],
    reward: 5_000,
  }),
  scenario({
    id: "talk_of_the_coast",
    title: "Talk of the Coast",
    blurb: "Eight moons to become the place every dare on the coast ends at, while the hunters sharpen their cameras.",
    cash: 10_000,
    months: 8,
    targets: [
      { fact: "park.screams", atLeast: 450, label: "screaming exits" },
      { fact: "park.rating", atLeast: 600, label: "rumor" },
      { fact: "park.ghosts", atLeast: 3, label: "ghosts in residence" },
    ],
    after: "first_chill",
    reward: 10_000,
  }),
  scenario({
    id: "full_moon_festival",
    title: "Full Moon Festival",
    blurb: "Two seasons of nights to make the park a paradise for the dead. On the last full moon every ghost on the coast comes to the festival - if they have a home to come to.",
    cash: 10_000,
    months: 16,
    targets: [
      { fact: "park.screams", atLeast: 1_500, label: "screaming exits" },
      { fact: "park.rating", atLeast: 850, label: "rumor" },
      { fact: "park.ghosts", atLeast: 6, label: "ghosts in residence" },
    ],
    after: "talk_of_the_coast",
    reward: 20_000,
  }),
];

/** The first scenario: a new game starts here. */
export const FIRST_SCENARIO = "first_chill";

export function scenarioDef(id: string): ScenarioDef | null {
  return SCENARIOS.find((entry) => entry.id === id) ?? null;
}

const WON_KEY = "hauntworks.scenarios-won";

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
