import type { CityMetrics, DistrictCharter } from "../catalog";

export type CharterChoice = "open" | "quiet" | "shared" | "specialist" | "reuse" | "formal";

export interface EventChoice {
  label: string;
  detail: string;
  choice: CharterChoice;
  impacts: string[];
}

export interface CityEvent {
  id: keyof DistrictCharter;
  sketch: number;
  kicker: string;
  title: string;
  copy: string;
  choices: EventChoice[];
}

export interface GrowthObjective {
  label: string;
  current: number;
  target: number;
  direction?: "min" | "max";
  unit?: string;
  decimals?: number;
  available?: boolean;
}

export interface GrowthBrief {
  name: string;
  note: string;
  reward: string;
  objectives: GrowthObjective[];
}

export const CITY_EVENTS: CityEvent[] = [
  {
    id: "undercroft",
    sketch: 1,
    kicker: "City choice / ground life",
    title: "How should the ground live?",
    copy: "Covered walks, courtyards, and building edges can support late markets and long evenings, or planted thresholds, soft light, and quieter shared gardens.",
    choices: [
      { label: "Keep the ground open", detail: "Night stalls and longer evening life appear beneath raised buildings.", choice: "open", impacts: ["ADDS NIGHT MARKETS", "ACTIVITY +11", "LIVELIER EVENINGS"] },
      { label: "Make quiet courtyards", detail: "Planters and soft thresholds turn the ground floor into calm shared gardens.", choice: "quiet", impacts: ["ADDS GARDEN ROOMS", "APPROVAL +3", "CALMER NIGHTS"] },
    ],
  },
  {
    id: "commons",
    sketch: 2,
    kicker: "City choice / shared space",
    title: "What should buildings share?",
    copy: "The district can weave open common rooms through many buildings, or let workshops, studios, and cultural spaces become more distinct and specialized.",
    choices: [
      { label: "Make common rooms", detail: "Warm shared-room bands appear across housing, civic, and mixed buildings.", choice: "shared", impacts: ["ADDS COMMON ROOMS", "APPROVAL +7", "ACTIVITY +4"] },
      { label: "Grow specialist places", detail: "Studios and cultural buildings develop brighter workshops and stronger identities.", choice: "specialist", impacts: ["ADDS WORKSHOP LIGHTS", "JOBS +8%", "CULTURE +8%"] },
    ],
  },
  {
    id: "aggregate",
    sketch: 3,
    kicker: "City choice / material language",
    title: "How should the city age?",
    copy: "Frames and panels can return in a visibly adapted city, or the district can pursue cleaner joints and a more formal concrete language.",
    choices: [
      { label: "Build from what remains", detail: "Reclaimed panels, repairs, and mismatched aggregate become part of the city.", choice: "reuse", impacts: ["ADDS RECLAIMED PANELS", "CARBON −18%", "VISIBLE REPAIR"] },
      { label: "Keep a formal language", detail: "Clean joint bands and slower weathering give the district a composed civic character.", choice: "formal", impacts: ["ADDS CLEAN JOINTS", "SLOWER WEATHERING", "CARBON +6%"] },
    ],
  },
];

export function growthBriefs(metrics: CityMetrics, buildingsCount: number, plazasCount: number): GrowthBrief[] {
  return [
    {
      name: "A lived-in neighborhood",
      note: "Build homes, workplaces, and welcoming public space.",
      reward: "Unlocks a choice for life at ground level.",
      objectives: [
        { label: "House 2,500 residents", current: metrics.population, target: 2500 },
        { label: "Create 1,200 jobs", current: metrics.jobs, target: 1200 },
        { label: "Reach 72% public approval", current: metrics.approval, target: 72 },
        { label: "Build four public spaces", current: plazasCount, target: 4 },
      ],
    },
    {
      name: "The carbon commons",
      note: "Pair civic life with lower-impact buildings and planted ground.",
      reward: "Unlocks a choice for shared rooms and specialist places.",
      objectives: [
        { label: "Reach 4,000 residents", current: metrics.population, target: 4000 },
        { label: "Create six public spaces", current: plazasCount, target: 6 },
        { label: "Establish 500 civic capacity", current: metrics.civic, target: 500 },
        {
          label: "Keep carbon below 6t per resident",
          current: metrics.population > 0 ? metrics.carbon / metrics.population : 0,
          target: 6,
          direction: "max",
          unit: "t",
          decimals: 1,
          available: metrics.population > 0,
        },
      ],
    },
    {
      name: "The open metropolis",
      note: "Bring many kinds of buildings and public life together.",
      reward: "Unlocks a choice for the city’s material language.",
      objectives: [
        { label: "House 7,500 residents", current: metrics.population, target: 7500 },
        { label: "Create 4,500 jobs", current: metrics.jobs, target: 4500 },
        { label: "Reach 85 public-life index", current: metrics.activity, target: 85 },
        { label: "Shape 28 structures", current: buildingsCount, target: 28 },
      ],
    },
  ];
}

export const objectiveDone = (objective: GrowthObjective): boolean =>
  objective.available !== false &&
  (objective.direction === "max" ? objective.current <= objective.target : objective.current >= objective.target);

export function objectiveProgress(objective: GrowthObjective): string {
  const value =
    objective.available === false
      ? "—"
      : objective.decimals !== undefined
        ? objective.current.toFixed(objective.decimals)
        : Math.round(objective.current).toLocaleString();
  const target = objective.decimals !== undefined ? objective.target.toFixed(objective.decimals) : Math.round(objective.target).toLocaleString();
  return objective.direction === "max"
    ? `${value}${objective.unit ?? ""} / ≤ ${target}${objective.unit ?? ""}`
    : `${value} / ${target}${objective.unit ?? ""}`;
}

export const briefCompleted = (brief: GrowthBrief): boolean => brief.objectives.every(objectiveDone);

export const nextCharterEvent = (briefStage: number, charter: DistrictCharter): CityEvent | null =>
  CITY_EVENTS.find((event) => event.sketch <= briefStage && charter[event.id] === undefined) ?? null;

export const WEAR_PER_DAY = 0.03;
export const FORMAL_WEAR_PER_DAY = 0.012;
export const AGE_PER_DAY = 0.08;
export const CONDITION_FLOOR = 72;
