import { shuffleWithRng } from "@jgengine/core/cards/cardPile";
import { createRecordBook, type RecordBook, type RecordStorage } from "@jgengine/core/game/recordBook";
import { seededRng } from "@jgengine/core/random/rng";

import type { Card, CardId } from "./cards";
import { buildDeck, parseCard } from "./cards";
import { evaluateHand, type HandCategory } from "./evaluator";
import { MAX_BET, MIN_BET, payout } from "./paytable";

export type Phase = "bet" | "draw";

export const START_BANK = 200;
export const REBUY_BANK = 200;

const BANK_KEY = "videopoker:bank";
const SEED_KEY = "videopoker:seed";
const RECORDS_KEY = "videopoker:records";

type RecordKey = "peakBank" | "biggestWin";

export interface PokerRecords {
  readonly peakBank: number | null;
  readonly biggestWin: number | null;
}

export interface PokerSnapshot {
  readonly bank: number;
  readonly bet: number;
  readonly phase: Phase;
  readonly hand: readonly Card[];
  readonly held: readonly boolean[];
  readonly lastCategory: HandCategory | null;
  readonly lastWin: number;
  readonly resultId: number;
  readonly records: PokerRecords;
  readonly canBet: boolean;
  readonly canDeal: boolean;
  readonly canDraw: boolean;
  readonly broke: boolean;
}

export interface PokerDeps {
  readonly storage?: RecordStorage | null;
  readonly seed?: number;
  readonly startBank?: number;
}

export interface PokerGame {
  getState(): PokerSnapshot;
  subscribe(listener: (state: PokerSnapshot) => void): () => void;
  setBet(bet: number): void;
  betOne(): void;
  betMax(): void;
  toggleHold(index: number): void;
  deal(): void;
  draw(): void;
  dealOrDraw(): void;
  rebuy(): void;
  reset(): void;
}

export function browserStorage(): RecordStorage | null {
  return typeof localStorage === "undefined" ? null : (localStorage as RecordStorage);
}

function readNumber(storage: RecordStorage | null, key: string, fallback: number): number {
  try {
    const raw = storage?.getItem(key) ?? null;
    if (raw === null) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeNumber(storage: RecordStorage | null, key: string, value: number): void {
  try {
    storage?.setItem(key, String(value));
  } catch {
    return;
  }
}

export function createPokerGame(deps: PokerDeps = {}): PokerGame {
  const storage = deps.storage ?? null;
  const startBank = deps.startBank ?? START_BANK;
  const records: RecordBook<RecordKey> = createRecordBook<RecordKey>({
    key: RECORDS_KEY,
    fields: { peakBank: "higher", biggestWin: "higher" },
    storage,
  });

  const listeners = new Set<(state: PokerSnapshot) => void>();

  let bank = readNumber(storage, BANK_KEY, startBank);
  let handSeed = deps.seed ?? readNumber(storage, SEED_KEY, 1);
  let bet = MIN_BET;
  let phase: Phase = "bet";
  let hand: Card[] = [];
  let held: boolean[] = [false, false, false, false, false];
  let deck: CardId[] = [];
  let stockPtr = 5;
  let lastCategory: HandCategory | null = null;
  let lastWin = 0;
  let resultId = 0;

  let snapshot: PokerSnapshot = build();

  function build(): PokerSnapshot {
    const broke = phase === "bet" && bank < MIN_BET;
    return {
      bank,
      bet,
      phase,
      hand: hand.slice(),
      held: held.slice(),
      lastCategory,
      lastWin,
      resultId,
      records: { peakBank: records.bestOf("peakBank"), biggestWin: records.bestOf("biggestWin") },
      canBet: phase === "bet",
      canDeal: phase === "bet" && bank >= bet && bank >= MIN_BET,
      canDraw: phase === "draw",
      broke,
    };
  }

  function commit(): void {
    snapshot = build();
    for (const listener of listeners) listener(snapshot);
  }

  function setBet(next: number): void {
    if (phase !== "bet") return;
    const clamped = Math.max(MIN_BET, Math.min(MAX_BET, Math.floor(next)));
    if (clamped === bet) return;
    bet = clamped;
    commit();
  }

  function betOne(): void {
    if (phase !== "bet") return;
    bet = bet >= MAX_BET ? MIN_BET : bet + 1;
    commit();
  }

  function betMax(): void {
    if (phase !== "bet") return;
    bet = MAX_BET;
    commit();
  }

  function toggleHold(index: number): void {
    if (phase !== "draw") return;
    if (index < 0 || index >= held.length) return;
    held[index] = !held[index];
    commit();
  }

  function deal(): void {
    if (phase !== "bet") return;
    if (bank < bet || bank < MIN_BET) return;
    bank -= bet;
    const shuffled = shuffleWithRng(buildDeck(), seededRng(handSeed));
    deck = shuffled;
    hand = shuffled.slice(0, 5).map(parseCard);
    held = [false, false, false, false, false];
    stockPtr = 5;
    lastCategory = null;
    lastWin = 0;
    phase = "draw";
    handSeed += 1;
    writeNumber(storage, SEED_KEY, handSeed);
    writeNumber(storage, BANK_KEY, bank);
    commit();
  }

  function draw(): void {
    if (phase !== "draw") return;
    const next = hand.slice();
    for (let i = 0; i < next.length; i += 1) {
      if (!held[i]) {
        next[i] = parseCard(deck[stockPtr]);
        stockPtr += 1;
      }
    }
    hand = next;
    const category = evaluateHand(hand);
    const win = payout(category, bet);
    bank += win;
    lastCategory = category;
    lastWin = win;
    resultId += 1;
    records.submit({ peakBank: bank, biggestWin: win });
    phase = "bet";
    writeNumber(storage, BANK_KEY, bank);
    commit();
  }

  function dealOrDraw(): void {
    if (phase === "bet") deal();
    else draw();
  }

  function rebuy(): void {
    if (bank >= MIN_BET) return;
    bank = REBUY_BANK;
    writeNumber(storage, BANK_KEY, bank);
    commit();
  }

  function reset(): void {
    bank = startBank;
    bet = MIN_BET;
    phase = "bet";
    hand = [];
    held = [false, false, false, false, false];
    deck = [];
    stockPtr = 5;
    lastCategory = null;
    lastWin = 0;
    writeNumber(storage, BANK_KEY, bank);
    commit();
  }

  return {
    getState: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setBet,
    betOne,
    betMax,
    toggleHold,
    deal,
    draw,
    dealOrDraw,
    rebuy,
    reset,
  };
}

export const poker: PokerGame = createPokerGame({ storage: browserStorage() });
