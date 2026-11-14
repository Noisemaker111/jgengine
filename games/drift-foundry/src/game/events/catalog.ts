import type { MedalBoardConfig, MedalDirection } from "@jgengine/core/progression/medalBoard";

import { COMPACTOR_BASE_SPEED, type CompactorPlan } from "../compactor/schedule";
import type { RivalDef } from "../race/opponents";

/**
 * The yard calendar: every event is one of the yard's tracks under its own rules - who is on the
 * grid, how hard the crusher comes, whether the pit garage's build is allowed - and one number the
 * medals are judged on. Medals add up to points and points open the next tier, the way Trials and
 * Trackmania hand out their next set of tracks.
 */

export type EventMetric = "place" | "time" | "sweep" | "grudge";

export interface YardEvent {
  id: string;
  label: string;
  tier: TierId;
  /** The track this event runs on (see tracks/catalog.ts). */
  track: string;
  /** One line on the calendar card. */
  blurb: string;
  metric: EventMetric;
  /** Bronze, silver and gold on that metric. */
  targets: { bronze: number; silver: number; gold: number };
  /** Rival ids on the grid; `"all"` is the full field and `[]` is the corridor alone. */
  rivals: "all" | readonly string[];
  /** Pace multiplier for every rival on the grid. */
  rivalPace?: number;
  /** Line multiplier: under 1 pulls every rival onto a cleaner, faster line. */
  rivalLine?: number;
  /** The pit garage's bought parts are bolted on at the start; off means route salvage only. */
  garage: boolean;
  /** Changes to the crusher on top of the shift the run drew. */
  compactor?: { startZ?: number; baseSpeed?: number; surgeSpeed?: number; surgeEarlier?: number };
  /** Credits paid the first time each medal is earned on this event. */
  rewards: { bronze: number; silver: number; gold: number };
}

export type TierId = "aisle-nine" | "late-shift" | "empty-cart" | "legend";

export const YARD_TIERS: readonly { id: TierId; label: string; requires: number }[] = [
  { id: "aisle-nine", label: "Row Six", requires: 0 },
  { id: "late-shift", label: "Night Crew", requires: 4 },
  { id: "empty-cart", label: "Bare Metal", requires: 10 },
  { id: "legend", label: "Yard Legend", requires: 16 },
];

export const MEDALS = [
  { id: "bronze", label: "Bronze", points: 1 },
  { id: "silver", label: "Silver", points: 2 },
  { id: "gold", label: "Gold", points: 3 },
] as const;
export type MedalId = (typeof MEDALS)[number]["id"];

export const YARD_EVENTS: readonly YardEvent[] = [
  {
    id: "last-call",
    track: "aisle-nine",
    label: "Salvage Run",
    tier: "aisle-nine",
    blurb: "The shift as it always runs: three yard karts ahead, the crusher behind. Medals go on where you finish.",
    metric: "place",
    targets: { bronze: 3, silver: 2, gold: 1 },
    rivals: "all",
    garage: true,
    rewards: { bronze: 60, silver: 120, gold: 220 },
  },
  {
    id: "price-check",
    track: "produce",
    label: "Time Sheet",
    tier: "aisle-nine",
    blurb: "Nobody on the grid. The foreman holds a stopwatch at the gate and the crusher still rolls.",
    metric: "time",
    targets: { bronze: 66, silver: 54, gold: 43.5 },
    rivals: [],
    garage: true,
    rewards: { bronze: 60, silver: 120, gold: 220 },
  },
  {
    id: "cart-stuffer",
    track: "garden-center",
    label: "Scrap Sweep",
    tier: "aisle-nine",
    blurb: "The yard pays by the piece. Weave for every drop on the route and still make the gate.",
    metric: "sweep",
    targets: { bronze: 7, silver: 10, gold: 12 },
    rivals: "all",
    garage: true,
    rewards: { bronze: 60, silver: 120, gold: 220 },
  },
  {
    id: "lights-out",
    track: "electronics",
    label: "Night Shift",
    tier: "late-shift",
    blurb: "The night crew starts the crusher 15 m closer, runs it faster between surges and hits the surges harder.",
    metric: "time",
    targets: { bronze: 73, silver: 63, gold: 55 },
    rivals: "all",
    garage: true,
    compactor: { startZ: 15, baseSpeed: 3.4, surgeSpeed: 1.5, surgeEarlier: 8 },
    rewards: { bronze: 90, silver: 180, gold: 320 },
  },
  {
    id: "grudge-brick",
    track: "loading-bay",
    label: "Grudge: HOBBS",
    tier: "late-shift",
    blurb: "Just you and the yard champion on a clean line, 6% hotter than usual. Medals on your margin at the gate.",
    metric: "grudge",
    targets: { bronze: -6, silver: -2, gold: 1.5 },
    rivals: ["rival_brick"],
    rivalPace: 1.06,
    rivalLine: 0.4,
    garage: true,
    rewards: { bronze: 90, silver: 180, gold: 320 },
  },
  {
    id: "empty-cart",
    track: "toy-aisle",
    label: "Bare Metal",
    tier: "empty-cart",
    blurb: "The garage stays shut: a bare chassis and whatever the route drops. Beat the clock on salvage alone.",
    metric: "time",
    targets: { bronze: 68, silver: 61, gold: 54.5 },
    rivals: "all",
    garage: false,
    rewards: { bronze: 120, silver: 240, gold: 400 },
  },
  {
    id: "shutter-rush",
    track: "aisle-nine",
    label: "Crusher Rush",
    tier: "empty-cart",
    blurb: "The compactor never idles: it rolls at surge speed from the horn, 20 m behind. One stop and it has you.",
    metric: "time",
    targets: { bronze: 40, silver: 35, gold: 30.5 },
    rivals: [],
    garage: true,
    compactor: { startZ: 20, baseSpeed: 5.6, surgeSpeed: 2 },
    rewards: { bronze: 120, silver: 240, gold: 400 },
  },
  {
    id: "closing-time",
    track: "loading-bay",
    label: "Foundry Gauntlet",
    tier: "legend",
    blurb: "Everything at once: shut garage, the night crusher and the whole field on tight lines. Finish where you can.",
    metric: "place",
    targets: { bronze: 3, silver: 2, gold: 1 },
    rivals: "all",
    rivalPace: 1.07,
    rivalLine: 0.5,
    garage: false,
    compactor: { startZ: 12, baseSpeed: 2, surgeSpeed: 1.5, surgeEarlier: 6 },
    rewards: { bronze: 200, silver: 400, gold: 700 },
  },
];

export const DEFAULT_EVENT_ID = "last-call";

const DIRECTION: Record<EventMetric, MedalDirection> = { place: "lower", time: "lower", sweep: "higher", grudge: "higher" };

/** The calendar as the engine's medal board reads it. */
export const MEDAL_BOARD: MedalBoardConfig = {
  medals: MEDALS,
  tiers: YARD_TIERS,
  events: YARD_EVENTS.map((event) => ({ id: event.id, label: event.label, tier: event.tier, direction: DIRECTION[event.metric], targets: event.targets })),
};

export function eventById(id: string): YardEvent | null {
  return YARD_EVENTS.find((event) => event.id === id) ?? null;
}

/** The grid this event races: the shift-adjusted field, filtered and retuned by the event. */
export function eventRivals(event: YardEvent, defs: readonly RivalDef[]): readonly RivalDef[] {
  const allowed = event.rivals === "all" ? defs : defs.filter((def) => (event.rivals as readonly string[]).includes(def.id));
  if (event.rivalPace === undefined && event.rivalLine === undefined) return allowed;
  return allowed.map((def) => ({
    ...def,
    pace: def.pace * (event.rivalPace ?? 1),
    line: event.rivalLine === undefined ? def.line : def.line.map((offset) => Math.round(offset * event.rivalLine! * 10) / 10),
  }));
}

/** The crusher this event runs: the shift's plan with the event's start, base speed and surges on top. */
export function eventCompactor(event: YardEvent, plan: CompactorPlan): CompactorPlan {
  const change = event.compactor;
  if (change === undefined) return plan;
  const earlier = change.surgeEarlier ?? 0;
  return {
    startZ: plan.startZ + (change.startZ ?? 0),
    baseSpeed: (plan.baseSpeed ?? COMPACTOR_BASE_SPEED) + (change.baseSpeed ?? 0),
    surges: plan.surges.map((surge) => ({
      ...surge,
      startT: Math.max(0, surge.startT - earlier),
      endT: Math.max(1, surge.endT - earlier),
      speed: surge.speed + (change.surgeSpeed ?? 0),
    })),
  };
}

/** How the event's number reads on a card: `P2`, `38.4 s`, `9 drops`, `+1.2 s on HOBBS`. */
export function formatMetric(metric: EventMetric, value: number): string {
  if (metric === "place") return `P${Math.round(value)}`;
  if (metric === "time") return `${value.toFixed(1)} s`;
  if (metric === "sweep") return `${Math.round(value)} drops`;
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)} s on HOBBS`;
}

/** What a medal asks for, in words: `finish P1`, `under 35.0 s`, `12 drops`, `beat HOBBS by 2.5 s`. */
export function targetText(metric: EventMetric, value: number): string {
  if (metric === "place") return value === 1 ? "win it" : `finish P${value} or better`;
  if (metric === "time") return `escape in ${value.toFixed(1)} s`;
  if (metric === "sweep") return `sweep ${value} drops and escape`;
  if (value < 0) return `finish within ${Math.abs(value).toFixed(1)} s of HOBBS`;
  if (value === 0) return "beat HOBBS to the gate";
  return `beat HOBBS by ${value.toFixed(1)} s`;
}
