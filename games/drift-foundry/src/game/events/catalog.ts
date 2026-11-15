import type { MedalBoardConfig, MedalDirection } from "@jgengine/core/progression/medalBoard";

import { COMPACTOR_BASE_SPEED, type CompactorPlan } from "../compactor/schedule";
import { GUARD_DEF, type RivalDef } from "../race/opponents";

/**
 * The weekly circular: every event is one of the store's departments under its own rules - who is
 * in the aisle, how hard the shutters come, whether customer service's mods are allowed - and one
 * number the medals are judged on. Medals add up to points and points open the next tier, the way Trials and
 * Trackmania hand out their next set of tracks.
 */

/** `value` is dollars in the basket at the self-checkout. */
export type EventMetric = "place" | "time" | "value" | "grudge";

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
  /** Rival ids on the grid; `"all"` is the full field and `[]` is the aisle alone. */
  rivals: "all" | readonly string[];
  /** Officer Dale patrols the aisle: he blocks your lane and tackles on contact. */
  guard?: boolean;
  /** Pace multiplier for every rival on the grid. */
  rivalPace?: number;
  /** Line multiplier: under 1 pulls every rival onto a cleaner, faster line. */
  rivalLine?: number;
  /** Customer service's bought mods are fitted at the start; off means the aisle's displays only. */
  garage: boolean;
  /** Changes to the shutters on top of the PA announcement the run drew. */
  compactor?: { startZ?: number; baseSpeed?: number; surgeSpeed?: number; surgeEarlier?: number };
  /** Credits paid the first time each medal is earned on this event. */
  rewards: { bronze: number; silver: number; gold: number };
}

export type TierId = "aisle-nine" | "late-shift" | "empty-cart" | "legend";

export const YARD_TIERS: readonly { id: TierId; label: string; requires: number }[] = [
  { id: "aisle-nine", label: "Weeknight", requires: 0 },
  { id: "late-shift", label: "Late Shift", requires: 4 },
  { id: "empty-cart", label: "Empty Cart", requires: 10 },
  { id: "legend", label: "Store Legend", requires: 16 },
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
    label: "Last Call",
    tier: "aisle-nine",
    blurb: "The store is now closing. Three late shoppers ahead of you, the shutters behind. Medals go on where you finish.",
    metric: "place",
    targets: { bronze: 3, silver: 2, gold: 1 },
    rivals: "all",
    garage: true,
    rewards: { bronze: 60, silver: 120, gold: 220 },
  },
  {
    id: "price-check",
    track: "produce",
    label: "Price Check",
    tier: "aisle-nine",
    blurb: "Nobody else in the aisle. The night manager holds a stopwatch at the tills and the scrubber still rolls.",
    metric: "time",
    targets: { bronze: 66, silver: 54, gold: 43.5 },
    rivals: [],
    garage: true,
    rewards: { bronze: 60, silver: 120, gold: 220 },
  },
  {
    id: "cart-stuffer",
    track: "garden-center",
    label: "Cart Stuffer",
    tier: "aisle-nine",
    blurb: "The self-checkout rings up everything in the basket. Load the cart off the shelves and still make the tills.",
    metric: "value",
    targets: { bronze: 40, silver: 90, gold: 135 },
    rivals: "all",
    garage: true,
    rewards: { bronze: 60, silver: 120, gold: 220 },
  },
  {
    id: "lights-out",
    track: "electronics",
    label: "Lights Out",
    tier: "late-shift",
    blurb: "The night crew starts the shutters 15 m closer, runs the scrubber faster and Officer Dale is on patrol.",
    metric: "time",
    targets: { bronze: 73, silver: 63, gold: 55 },
    rivals: "all",
    guard: true,
    garage: true,
    compactor: { startZ: 15, baseSpeed: 3.4, surgeSpeed: 1.5, surgeEarlier: 8 },
    rewards: { bronze: 90, silver: 180, gold: 320 },
  },
  {
    id: "produce-derby",
    track: "produce",
    label: "Produce Derby",
    tier: "late-shift",
    blurb: "The whole field round the salad bar and the cooler hairpins. Somebody says there is a way through the cold room.",
    metric: "place",
    targets: { bronze: 3, silver: 2, gold: 1 },
    rivals: "all",
    garage: true,
    rewards: { bronze: 90, silver: 180, gold: 320 },
  },
  {
    id: "dock-derby",
    track: "loading-bay",
    label: "Dock Derby",
    tier: "late-shift",
    blurb: "A full-field race through the tugger crossings, every rival 3% hotter. The trailer cut is open.",
    metric: "place",
    targets: { bronze: 3, silver: 2, gold: 1 },
    rivals: "all",
    rivalPace: 1.03,
    garage: true,
    rewards: { bronze: 90, silver: 180, gold: 320 },
  },
  {
    id: "grudge-brick",
    track: "loading-bay",
    label: "Grudge: BRICK",
    tier: "late-shift",
    blurb: "Just you and the gym regular on a clean line, 6% hotter than usual. Medals on your margin at the tills.",
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
    label: "Empty Cart",
    tier: "empty-cart",
    blurb: "Customer service is shut: a bare standard cart and whatever mods the aisle hands you. Beat the clock.",
    metric: "time",
    targets: { bronze: 68, silver: 61, gold: 54.5 },
    rivals: "all",
    garage: false,
    rewards: { bronze: 120, silver: 240, gold: 400 },
  },
  {
    id: "garden-gp",
    track: "garden-center",
    label: "Garden Grand Prix",
    tier: "empty-cart",
    blurb: "Out in the rain on wet pavers and potting mud, the full field on tight lines. Medals go on where you finish.",
    metric: "place",
    targets: { bronze: 3, silver: 2, gold: 1 },
    rivals: "all",
    rivalLine: 0.7,
    garage: true,
    rewards: { bronze: 120, silver: 240, gold: 400 },
  },
  {
    id: "shutter-rush",
    track: "aisle-nine",
    label: "Shutter Rush",
    tier: "empty-cart",
    blurb: "The shutters never pause: the scrubber rolls at surge speed from the PA chime, 20 m behind. One stop and it has you.",
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
    label: "Closing Time",
    tier: "legend",
    blurb: "Everything at once: customer service shut, the night shutters, the whole field on tight lines and Officer Dale. Finish where you can.",
    metric: "place",
    targets: { bronze: 3, silver: 2, gold: 1 },
    rivals: "all",
    guard: true,
    rivalPace: 1.07,
    rivalLine: 0.5,
    garage: false,
    compactor: { startZ: 12, baseSpeed: 2, surgeSpeed: 1.5, surgeEarlier: 6 },
    rewards: { bronze: 200, silver: 400, gold: 700 },
  },
];

export const DEFAULT_EVENT_ID = "last-call";

const DIRECTION: Record<EventMetric, MedalDirection> = { place: "lower", time: "lower", value: "higher", grudge: "higher" };

/** The calendar as the engine's medal board reads it. */
export const MEDAL_BOARD: MedalBoardConfig = {
  medals: MEDALS,
  tiers: YARD_TIERS,
  events: YARD_EVENTS.map((event) => ({ id: event.id, label: event.label, tier: event.tier, direction: DIRECTION[event.metric], targets: event.targets })),
};

export function eventById(id: string): YardEvent | null {
  return YARD_EVENTS.find((event) => event.id === id) ?? null;
}

/** The grid this event races: the shift-adjusted field, filtered and retuned by the event, Officer Dale last when he patrols. */
export function eventRivals(event: YardEvent, defs: readonly RivalDef[]): readonly RivalDef[] {
  const racing = event.rivals === "all" ? defs : defs.filter((def) => (event.rivals as readonly string[]).includes(def.id));
  const allowed = event.guard === true ? [...racing, GUARD_DEF] : racing;
  if (event.rivalPace === undefined && event.rivalLine === undefined) return allowed;
  return allowed.map((def) => def.blocker === true ? def : ({
    ...def,
    pace: def.pace * (event.rivalPace ?? 1),
    line: event.rivalLine === undefined ? def.line : def.line.map((offset) => Math.round(offset * event.rivalLine! * 10) / 10),
  }));
}

/** The racers on an event's grid: everyone but the guard, who blocks instead of racing. */
export function eventRacers(event: YardEvent, defs: readonly RivalDef[]): readonly RivalDef[] {
  return eventRivals(event, defs).filter((def) => def.blocker !== true);
}

/** The shutters this event runs: the announcement's plan with the event's start, base speed and surges on top. */
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

/** How the event's number reads on a card: `P2`, `38.4 s`, `$212 in the cart`, `+1.2 s on BRICK`. */
export function formatMetric(metric: EventMetric, value: number): string {
  if (metric === "place") return `P${Math.round(value)}`;
  if (metric === "time") return `${value.toFixed(1)} s`;
  if (metric === "value") return `$${Math.round(value)} in the cart`;
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)} s on BRICK`;
}

/** What a medal asks for, in words: `finish P1`, `under 35.0 s`, `$140 at the tills`, `beat BRICK by 2.5 s`. */
export function targetText(metric: EventMetric, value: number): string {
  if (metric === "place") return value === 1 ? "win it" : `finish P${value} or better`;
  if (metric === "time") return `check out in ${value.toFixed(1)} s`;
  if (metric === "value") return `check out $${value} of shopping`;
  if (value < 0) return `finish within ${Math.abs(value).toFixed(1)} s of BRICK`;
  if (value === 0) return "beat BRICK to the tills";
  return `beat BRICK by ${value.toFixed(1)} s`;
}
