import type { Curve } from "@jgengine/core/game/progression";
import { createCareerBank, type CareerBankState } from "@jgengine/core/progression/careerBank";
import { createGateSet, gateFacts } from "@jgengine/core/progression/gates";
import { createStanding, type StandingState } from "@jgengine/core/progression/standing";
import { createUpgradeTree, type UpgradeState } from "@jgengine/core/progression/upgrades";
import { createMedalBoard, type MedalBoardState } from "@jgengine/core/progression/medalBoard";

import { DEFAULT_EVENT_ID, eventById, MEDAL_BOARD, YARD_EVENTS } from "./events/catalog";

import { partById, PART_SLOTS, PARTS, type DriftFoundryPartDef, type PartSlotId } from "./parts/catalog";

/** The pit pays in yard credits; the same money buys the next build. */
export const CREDITS = { id: "credits", name: "Yard credits", unit: "cr" };

/** One driver, so standing and money belong to the profile, not a seat list. */
export const DRIVER = "driver";

/** Credits a single swept salvage drop is worth, before the escape bonus. */
export const SALVAGE_CREDITS = 25;
/** Credits for bringing the buggy through the 470 m gate. */
export const ESCAPE_BONUS = 100;

/** The one price curve every ladder rank is priced from. */
export const PART_PRICE: Curve = { kind: "power", base: 150, exponent: 1.35, round: "round", min: 120 };

export const YARD_STANDING = {
  tracks: [
    {
      id: "yard",
      label: "Row Six",
      initial: 0,
      min: -40,
      max: 200,
      tiers: [
        { id: "unknown", min: -40, relation: "neutral" as const },
        { id: "known", min: 10, relation: "friendly" as const },
        { id: "trusted", min: 25, relation: "friendly" as const },
        { id: "yard-legend", min: 50, relation: "friendly" as const },
      ],
    },
  ],
  outcomes: [
    { id: "escape", label: "Through the exit gate", impacts: { yard: 10 } },
    { id: "crushed", label: "Caught by the compactor", impacts: { yard: -4 } },
  ],
};

/** Parts the yard will not sell until the driver is known well enough. */
const PART_GATES = [
  { id: "part_plow", unlock: "plow_blade", requires: { standing: { trackId: "yard", min: 0 } } },
  { id: "part_treads", unlock: "monster_treads", label: "Monster treads", requires: { standing: { trackId: "yard", min: 12 } } },
  { id: "part_ev", unlock: "ev_conversion", label: "EV conversion", requires: { standing: { trackId: "yard", min: 25 } } },
  { id: "part_armor", unlock: "armor_plating", label: "Armor plating", requires: { standing: { trackId: "yard", min: 40 } } },
];

/** The yard's locked shelf. Built at load, so a part id that does not exist throws here. */
export const YARD_COUNTER = createGateSet({
  gates: PART_GATES,
  catalog: { has: (id) => PARTS.some((part) => part.id === id) },
  standing: createStanding(YARD_STANDING),
});

/** Each slot is a ladder: rank `n` is the `n`th catalog part for that slot. */
export const LADDERS: Record<PartSlotId, readonly string[]> = {
  engine: ["salvage_v6", "truck_engine", "ev_conversion"],
  front: ["hood_plate", "fan_blade_vanes", "plow_blade"],
  wheels: ["steel_rims", "coil_springs", "monster_treads"],
  frame: ["scrap_frame", "roll_cage", "armor_plating"],
};

const NODES = PART_SLOTS.map((slot) => ({
  id: slot,
  label: slot.toUpperCase(),
  cost: PART_PRICE,
  maxRank: LADDERS[slot].length,
}));

/** Plain career state: money, standing and which ladder rungs are owned. */
export interface CareerSave {
  version: 1;
  bank: CareerBankState;
  standing: StandingState;
  ladders: UpgradeState;
  /** Best result per calendar event; the medals and open tiers are read from it. */
  medals: MedalBoardState;
  /** The calendar event the next run races. */
  event: string;
  /** The track each event ran on when its best was set; a best set on another track is dropped. */
  courses: Record<string, string>;
}

/** Every event's track today. Careers saved before the tracks ran every event on Row Six. */
const eventCourses = (): Record<string, string> => Object.fromEntries(YARD_EVENTS.map((event) => [event.id, event.track]));
const LEGACY_COURSE = "row-six";

/** Bests kept only for events still on the track they were set on. */
function sameCourseBests(medals: MedalBoardState, courses: unknown): MedalBoardState {
  const saved = typeof courses === "object" && courses !== null ? (courses as Record<string, unknown>) : {};
  const now = eventCourses();
  if (typeof medals.best !== "object" || medals.best === null) return medals;
  const best: Record<string, number> = {};
  for (const [id, value] of Object.entries(medals.best)) {
    if ((saved[id] ?? LEGACY_COURSE) === now[id]) best[id] = value;
  }
  return { ...medals, best };
}

export const CAREER_KEY = "drift-foundry.career.v1";
export interface CareerStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

export function newCareer(): CareerSave {
  return {
    version: 1,
    bank: { banked: 0, haul: 0, deposited: 0, lost: 0, bestHaul: 0, runs: 0 },
    standing: { records: {} },
    ladders: { ranks: {} },
    medals: { best: {} },
    event: DEFAULT_EVENT_ID,
    courses: eventCourses(),
  };
}

export function readCareer(storage?: CareerStorage): CareerSave {
  try {
    const data = JSON.parse(storage?.getItem(CAREER_KEY) ?? "null") as Partial<CareerSave> | null;
    if (data === null || data.version !== 1) return newCareer();
    const fresh = newCareer();
    return {
      version: 1,
      bank: validBank(data.bank) ? data.bank : fresh.bank,
      standing: validStanding(data.standing) ? data.standing : fresh.standing,
      ladders: validLadders(data.ladders) ? data.ladders : fresh.ladders,
      // A career saved before the calendar has no medals and races the salvage run.
      // An event moved to a new track keeps none of its old bests: they were times on another road.
      medals: createMedalBoard({ ...MEDAL_BOARD, state: typeof data.medals === "object" && data.medals !== null ? sameCourseBests(data.medals, data.courses) : fresh.medals }).snapshot(),
      event: typeof data.event === "string" && eventById(data.event) !== null ? data.event : fresh.event,
      courses: fresh.courses,
    };
  } catch {
    return newCareer();
  }
}

export function saveCareer(career: CareerSave, storage?: CareerStorage): boolean {
  try {
    if (storage === undefined) return false;
    storage.setItem(CAREER_KEY, JSON.stringify(career));
    return true;
  } catch {
    return false;
  }
}

const amount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
function validBank(value: unknown): value is CareerBankState {
  if (typeof value !== "object" || value === null) return false;
  const bank = value as Record<string, unknown>;
  return amount(bank.banked) && amount(bank.haul) && amount(bank.deposited) && amount(bank.lost)
    && amount(bank.bestHaul) && Number.isSafeInteger(bank.runs) && (bank.runs as number) >= 0;
}
function validStanding(value: unknown): value is StandingState {
  if (typeof value !== "object" || value === null) return false;
  const records = (value as { records?: unknown }).records;
  if (typeof records !== "object" || records === null) return false;
  return Object.values(records).every((row) => typeof row === "object" && row !== null
    && Object.entries(row).every(([track, score]) => track === "yard" && typeof score === "number" && Number.isFinite(score)));
}
function validLadders(value: unknown): value is UpgradeState {
  if (typeof value !== "object" || value === null) return false;
  const ranks = (value as { ranks?: unknown }).ranks;
  if (typeof ranks !== "object" || ranks === null) return false;
  return Object.entries(ranks).every(([slot, rank]) => PART_SLOTS.includes(slot as PartSlotId)
    && Number.isSafeInteger(rank) && (rank as number) >= 0 && (rank as number) <= LADDERS[slot as PartSlotId].length);
}

/** The career as live handles over its stored state. */
export function standingOf(career: CareerSave) {
  const standing = createStanding(YARD_STANDING);
  standing.restore(career.standing);
  return standing;
}
export function bankOf(career: CareerSave) {
  return createCareerBank({ currency: CREDITS, state: career.bank });
}
export function medalsOf(career: CareerSave) {
  return createMedalBoard({ ...MEDAL_BOARD, state: career.medals });
}
export function laddersOf(career: CareerSave) {
  return createUpgradeTree({ nodes: NODES, state: career.ladders, standing: standingOf(career) });
}

/** One rung of a slot ladder: the part, its rank and its price, plus whether the yard will sell it. */
export interface GarageRow {
  slot: PartSlotId;
  part: DriftFoundryPartDef | null;
  rank: number;
  price: number | null;
  owned: boolean;
  locked: boolean;
  needs: number | null;
}

export function garageRows(career: CareerSave): GarageRow[] {
  const ladders = laddersOf(career);
  const standing = standingOf(career);
  const facts = gateFacts(standing, DRIVER);
  return PART_SLOTS.map((slot) => {
    const ladder = LADDERS[slot];
    const owned = ladders.rank(slot);
    const nextRank = owned + 1;
    const partId = ladder[nextRank - 1] ?? null;
    const part = partId === null ? null : partById(partId);
    const gate = partId === null ? null : YARD_COUNTER.gates().find((entry) => entry.unlock === partId) ?? null;
    const locked = gate !== null && !YARD_COUNTER.isOpen(gate.id, facts);
    return {
      slot,
      part,
      rank: nextRank,
      price: part === null ? null : ladders.costOf(slot, nextRank),
      owned: owned >= ladder.length,
      locked,
      needs: gate?.requires?.standing?.min ?? null,
    };
  });
}

/** Buy the next rung of a slot ladder; throws a readable reason when the yard refuses. */
export function buyPart(career: CareerSave, slot: PartSlotId): CareerSave {
  const row = garageRows(career).find((entry) => entry.slot === slot);
  if (row === undefined) throw new Error(`The yard has no ${slot} ladder`);
  if (row.owned) throw new Error(`The ${slot} ladder is fully built`);
  if (row.locked) throw new Error(`The yard will not sell ${row.part?.label ?? slot} yet - ${row.needs ?? 0} standing needed`);
  const bank = bankOf(career);
  const ladders = laddersOf(career);
  const bought = ladders.buy(slot, DRIVER, (cost) => bank.spend(cost));
  if (!bought.ok) throw new Error(bought.reason === "max-rank" ? `The ${slot} ladder is fully built` : `Not enough credits for ${row.part?.label ?? slot}`);
  return { ...career, bank: bank.snapshot(), ladders: ladders.snapshot(), standing: standingOf(career).snapshot() };
}

/** The built part in each slot, bolted on when a run starts. */
export function ownedParts(career: CareerSave): DriftFoundryPartDef[] {
  const ladders = laddersOf(career);
  const parts: DriftFoundryPartDef[] = [];
  for (const slot of PART_SLOTS) {
    const rank = ladders.rank(slot);
    if (rank < 1) continue;
    const part = partById(LADDERS[slot][rank - 1]!);
    if (part !== null) parts.push(part);
  }
  return parts;
}

/** Settle a finished run: the haul banks on an escape and is lost to the compactor. */
export function settleRun(
  career: CareerSave,
  run: { kind: "escape" | "crushed"; place: number; haul: number; medals?: MedalBoardState },
): CareerSave {
  const bank = bankOf(career);
  const standing = standingOf(career);
  bank.earn(run.haul);
  if (run.kind === "escape") {
    bank.cashOut();
    standing.apply(DRIVER, "escape");
    if (run.place === 1) standing.adjust(DRIVER, "yard", 4);
  } else {
    bank.loseHaul();
    standing.apply(DRIVER, "crushed");
  }
  return { ...career, bank: bank.snapshot(), standing: standing.snapshot(), medals: run.medals ?? career.medals };
}
