import { createPointsSeries, type PointsSeriesState } from "@jgengine/core/progression/pointsSeries";
import { isRecord } from "@jgengine/core/data/untyped";

import { eventById } from "../events/catalog";
import { RIVAL_DEFS } from "../race/opponents";
import { PLAYER_RACER_ID } from "../race/standings";
import { trackById } from "../tracks/catalog";

/**
 * The Closing-Time Cup: a six-round championship, one full-field race in every department, scored
 * like a season. Each round pays its finishing places into the cup standings; Grandma June, the
 * Twins and Brick score too, so the board is a running rivalry, not a medal count.
 */
export const CUP_ROUNDS = ["last-call", "produce-derby", "dock-derby", "empty-cart", "lights-out", "garden-gp"] as const;

/** Points for 1st to 4th; a shopper the shutters catch scores nothing. */
export const CUP_POINTS = [10, 6, 4, 3] as const;

/** Store credit for lifting the cup, and for finishing it anywhere else on the podium. */
export const CUP_PURSE = { champion: 500, podium: 150 } as const;

export const CLOSING_TIME_CUP = createPointsSeries({
  rounds: CUP_ROUNDS,
  competitors: [PLAYER_RACER_ID, ...RIVAL_DEFS.map((rival) => rival.id)],
  points: CUP_POINTS,
});

/** The cup as the career keeps it: the season's results and whether a season is under way. */
export interface CupSave {
  state: PointsSeriesState;
  active: boolean;
  /** Cups the player has lifted. */
  won: number;
}

export function newCup(): CupSave {
  return { state: CLOSING_TIME_CUP.start(), active: false, won: 0 };
}

/** A saved cup, or a fresh one when the save is missing or names rounds or racers the cup does not. */
export function readCup(value: unknown): CupSave {
  if (!isRecord(value) || !isRecord(value["state"]) || !isRecord(value["state"]["results"])) return newCup();
  let state = CLOSING_TIME_CUP.start();
  try {
    for (const [round, places] of Object.entries(value["state"]["results"])) {
      if (!isRecord(places)) return newCup();
      const clean = Object.fromEntries(Object.entries(places).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isInteger(entry[1]) && entry[1] >= 0));
      state = CLOSING_TIME_CUP.record(state, round, clean);
    }
  } catch {
    return newCup();
  }
  const won = value["won"];
  return { state, active: value["active"] === true && !CLOSING_TIME_CUP.complete(state), won: typeof won === "number" && Number.isSafeInteger(won) && won >= 0 ? won : 0 };
}

/** Opens a new season, keeping the trophy count. */
export function startCup(cup: CupSave): CupSave {
  return { state: CLOSING_TIME_CUP.start(), active: true, won: cup.won };
}

/** The round the cup races next while a season is on, else null. */
export function cupRound(cup: CupSave): string | null {
  return cup.active ? CLOSING_TIME_CUP.nextRound(cup.state) : null;
}

/** What one recorded round paid out: the season's new state and any purse for finishing it. */
export interface CupRoundResult {
  cup: CupSave;
  /** Places this round, by racer id (0: caught by the shutters). */
  places: Readonly<Record<string, number>>;
  /** The champion when this round closed the season. */
  champion: string | null;
  /** Store credit for the final standings (0 before the last round or off the podium). */
  purse: number;
  /** The player's rank in the cup after the round. */
  rank: number;
}

/**
 * Records the round the cup is on. `places` is every racer's finishing place; the player's is 0
 * when the shutters caught them. Returns null when no season is on or `eventId` is not its round.
 */
export function recordCupRound(cup: CupSave, eventId: string, places: Readonly<Record<string, number>>): CupRoundResult | null {
  if (cupRound(cup) !== eventId) return null;
  const state = CLOSING_TIME_CUP.record(cup.state, eventId, places);
  const champion = CLOSING_TIME_CUP.champion(state);
  const rank = CLOSING_TIME_CUP.standings(state).find((row) => row.id === PLAYER_RACER_ID)!.rank;
  const purse = champion === null ? 0 : champion === PLAYER_RACER_ID ? CUP_PURSE.champion : rank <= 3 ? CUP_PURSE.podium : 0;
  return {
    cup: { state, active: champion === null, won: cup.won + (champion === PLAYER_RACER_ID ? 1 : 0) },
    places,
    champion,
    purse,
    rank,
  };
}

/** Display names for the cup board. */
export function racerName(id: string): string {
  if (id === PLAYER_RACER_ID) return "YOU";
  return RIVAL_DEFS.find((rival) => rival.id === id)?.name ?? id;
}

/** One row of the cup board the pit draws. */
export interface CupBoardRow {
  id: string;
  name: string;
  rank: number;
  points: number;
  wins: number;
}

/** The cup board: the standings, the round list with who won each, and what is next. */
export interface CupBoard {
  active: boolean;
  won: number;
  roundNumber: number;
  roundCount: number;
  next: { id: string; label: string; track: string } | null;
  champion: string | null;
  standings: readonly CupBoardRow[];
  rounds: readonly { id: string; label: string; track: string; winner: string | null; yourPlace: number | null }[];
}

export function cupBoard(cup: CupSave): CupBoard {
  const nextId = cupRound(cup);
  const label = (id: string) => eventById(id)?.label ?? id;
  const track = (id: string) => trackById(eventById(id)?.track ?? "")?.def.label ?? "";
  return {
    active: cup.active,
    won: cup.won,
    roundNumber: CLOSING_TIME_CUP.roundNumber(cup.state),
    roundCount: CUP_ROUNDS.length,
    next: nextId === null ? null : { id: nextId, label: label(nextId), track: track(nextId) },
    champion: CLOSING_TIME_CUP.champion(cup.state),
    standings: CLOSING_TIME_CUP.standings(cup.state).map((row) => ({ id: row.id, name: racerName(row.id), rank: row.rank, points: row.points, wins: row.wins })),
    rounds: CUP_ROUNDS.map((id) => {
      const places = cup.state.results[id];
      const winner = places === undefined ? null : Object.entries(places).find(([, place]) => place === 1)?.[0] ?? null;
      return { id, label: label(id), track: track(id), winner: winner === null ? null : racerName(winner), yourPlace: places?.[PLAYER_RACER_ID] ?? null };
    }),
  };
}
