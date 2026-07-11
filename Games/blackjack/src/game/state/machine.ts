import { shuffleWithRng } from "@jgengine/core/cards/cardPile";
import { seededStreams } from "@jgengine/core/random/rng";

import { cardValue, DECKS, freshShoe, isTenValue } from "../rules/deck";
import type { Card } from "../rules/deck";
import { dealerShouldHit, handTotal, isBlackjack } from "../rules/scoring";
import { settleHand, settleInsurance } from "../rules/settle";
import type { Outcome } from "../rules/settle";
import { basicStrategy } from "../rules/strategy";
import type { Action } from "../rules/strategy";

export const START_BANK = 1000;
export const MIN_BET = 5;
export const MAX_BET = 500;
export const CHIP_DENOMS: readonly number[] = [5, 25, 100, 500];
export const MAX_HANDS = 4;
export const PENETRATION = 0.75;
export const DEALER_DRAW_MS = 550;

export type Phase = "betting" | "insurance" | "player" | "dealer" | "settle";

export interface HandState {
  cards: Card[];
  bet: number;
  doubled: boolean;
  fromSplit: boolean;
  isSplitAces: boolean;
  done: boolean;
  outcome: Outcome | null;
  payout: number;
}

export interface RoundHandSummary {
  outcome: Outcome;
  total: number;
  bet: number;
  net: number;
}

export interface RoundResult {
  id: number;
  dealerTotal: number;
  dealerBust: boolean;
  hands: RoundHandSummary[];
  net: number;
  insuranceNet: number;
}

export interface RecordsSnapshot {
  peakBank: number;
  bestStreak: number;
  handsWon: number;
}

export interface ShoeState {
  cards: Card[];
  pos: number;
  shuffleCount: number;
}

export interface TableState {
  phase: Phase;
  seed: string;
  bank: number;
  bet: number;
  hands: HandState[];
  activeHand: number;
  dealer: Card[];
  dealerHoleShown: boolean;
  insuranceOffered: boolean;
  insuranceBet: number;
  shoe: ShoeState;
  dealerDrawAt: number;
  message: string | null;
  hint: Action | null;
  history: RoundResult[];
  streak: number;
  totalWon: number;
  records: RecordsSnapshot;
  roundId: number;
  justShuffled: boolean;
}

function buildShoe(seed: string, shuffleCount: number): Card[] {
  return shuffleWithRng(freshShoe(DECKS), seededStreams(seed)(`shoe-${shuffleCount}`));
}

function newHand(bet: number): HandState {
  return { cards: [], bet, doubled: false, fromSplit: false, isSplitAces: false, done: false, outcome: null, payout: 0 };
}

export function createInitialState(
  seed: string,
  loaded?: { bank?: number; records?: RecordsSnapshot },
): TableState {
  const bank = loaded?.bank ?? START_BANK;
  const records = loaded?.records;
  return {
    phase: "betting",
    seed,
    bank,
    bet: 0,
    hands: [],
    activeHand: 0,
    dealer: [],
    dealerHoleShown: false,
    insuranceOffered: false,
    insuranceBet: 0,
    shoe: { cards: buildShoe(seed, 0), pos: 0, shuffleCount: 0 },
    dealerDrawAt: 0,
    message: null,
    hint: null,
    history: [],
    streak: 0,
    totalWon: records?.handsWon ?? 0,
    records: {
      peakBank: Math.max(records?.peakBank ?? bank, bank),
      bestStreak: records?.bestStreak ?? 0,
      handsWon: records?.handsWon ?? 0,
    },
    roundId: 1,
    justShuffled: false,
  };
}

function drawFromShoe(state: TableState): Card {
  if (state.shoe.pos >= state.shoe.cards.length) {
    state.shoe.shuffleCount += 1;
    state.shoe.cards = buildShoe(state.seed, state.shoe.shuffleCount);
    state.shoe.pos = 0;
    state.justShuffled = true;
  }
  const card = state.shoe.cards[state.shoe.pos];
  state.shoe.pos += 1;
  return card;
}

function reshuffleIfNeeded(state: TableState): void {
  const cut = Math.floor(state.shoe.cards.length * PENETRATION);
  if (state.shoe.pos >= cut) {
    state.shoe.shuffleCount += 1;
    state.shoe.cards = buildShoe(state.seed, state.shoe.shuffleCount);
    state.shoe.pos = 0;
    state.justShuffled = true;
  }
}

export function shoeRemaining(state: TableState): number {
  return state.shoe.cards.length - state.shoe.pos;
}

export function shoeTotal(state: TableState): number {
  return state.shoe.cards.length;
}

export function shoeFraction(state: TableState): number {
  return shoeRemaining(state) / state.shoe.cards.length;
}

export function placeBet(state: TableState, amount: number): void {
  if (state.phase !== "betting") return;
  const max = Math.min(MAX_BET, state.bank);
  state.bet = Math.max(0, Math.min(state.bet + amount, max));
}

export function clearBet(state: TableState): void {
  if (state.phase !== "betting") return;
  state.bet = 0;
}

export function deal(state: TableState): void {
  if (!canDeal(state)) return;
  state.justShuffled = false;
  reshuffleIfNeeded(state);
  const bet = state.bet;
  state.bank -= bet;
  const hand = newHand(bet);
  state.hands = [hand];
  state.dealer = [];
  state.activeHand = 0;
  state.dealerHoleShown = false;
  state.insuranceBet = 0;
  state.insuranceOffered = false;
  state.hint = null;
  state.message = state.justShuffled ? "Fresh shoe shuffled" : null;
  hand.cards.push(drawFromShoe(state));
  state.dealer.push(drawFromShoe(state));
  hand.cards.push(drawFromShoe(state));
  state.dealer.push(drawFromShoe(state));
  const up = state.dealer[0];
  if (up.rank === "A") {
    state.phase = "insurance";
    state.insuranceOffered = true;
    return;
  }
  if (isTenValue(up.rank) && isBlackjack(state.dealer)) {
    state.dealerHoleShown = true;
    settle(state);
    return;
  }
  beginPlayer(state);
}

function beginPlayer(state: TableState): void {
  const hand = state.hands[0];
  if (isBlackjack(hand.cards)) {
    state.dealerHoleShown = true;
    hand.done = true;
    settle(state);
    return;
  }
  state.phase = "player";
  state.activeHand = 0;
}

export function resolveInsurance(state: TableState, take: boolean): void {
  if (state.phase !== "insurance") return;
  const hand = state.hands[0];
  if (take) {
    const insBet = Math.floor(hand.bet / 2);
    if (insBet > 0 && state.bank >= insBet) {
      state.bank -= insBet;
      state.insuranceBet = insBet;
    }
  }
  state.insuranceOffered = false;
  if (isBlackjack(state.dealer)) {
    state.dealerHoleShown = true;
    settle(state);
    return;
  }
  beginPlayer(state);
}

export function hit(state: TableState): void {
  if (state.phase !== "player") return;
  const hand = state.hands[state.activeHand];
  hand.cards.push(drawFromShoe(state));
  state.hint = null;
  if (handTotal(hand.cards).total >= 21) {
    hand.done = true;
    advanceAfterHand(state);
  }
}

export function stand(state: TableState): void {
  if (state.phase !== "player") return;
  state.hands[state.activeHand].done = true;
  state.hint = null;
  advanceAfterHand(state);
}

export function double(state: TableState): void {
  if (!canDouble(state)) return;
  const hand = state.hands[state.activeHand];
  state.bank -= hand.bet;
  hand.bet *= 2;
  hand.doubled = true;
  hand.cards.push(drawFromShoe(state));
  hand.done = true;
  state.hint = null;
  advanceAfterHand(state);
}

export function split(state: TableState): void {
  if (!canSplit(state)) return;
  const index = state.activeHand;
  const hand = state.hands[index];
  state.bank -= hand.bet;
  const moved = hand.cards[1];
  const aces = hand.cards[0].rank === "A";
  hand.cards = [hand.cards[0]];
  hand.fromSplit = true;
  hand.isSplitAces = aces;
  const sibling = newHand(hand.bet);
  sibling.fromSplit = true;
  sibling.isSplitAces = aces;
  sibling.cards = [moved];
  state.hands.splice(index + 1, 0, sibling);
  state.hint = null;
  dealSecondToActive(state);
}

function dealSecondToActive(state: TableState): void {
  const hand = state.hands[state.activeHand];
  hand.cards.push(drawFromShoe(state));
  if (hand.isSplitAces || handTotal(hand.cards).total >= 21) {
    hand.done = true;
    advanceAfterHand(state);
  }
}

function advanceAfterHand(state: TableState): void {
  for (let j = state.activeHand + 1; j < state.hands.length; j += 1) {
    if (!state.hands[j].done) {
      state.activeHand = j;
      if (state.hands[j].cards.length === 1) dealSecondToActive(state);
      return;
    }
  }
  startDealerOrSettle(state);
}

function startDealerOrSettle(state: TableState): void {
  const anyAlive = state.hands.some((h) => handTotal(h.cards).total <= 21);
  if (!anyAlive) {
    state.dealerHoleShown = true;
    settle(state);
    return;
  }
  state.phase = "dealer";
  state.dealerHoleShown = false;
  state.dealerDrawAt = 0;
}

export function dealerStep(state: TableState, now: number): void {
  if (state.phase !== "dealer") return;
  if (!state.dealerHoleShown) {
    state.dealerHoleShown = true;
    state.dealerDrawAt = now + DEALER_DRAW_MS / 1000;
    return;
  }
  if (dealerShouldHit(handTotal(state.dealer))) {
    state.dealer.push(drawFromShoe(state));
    state.dealerDrawAt = now + DEALER_DRAW_MS / 1000;
    return;
  }
  settle(state);
}

export function settle(state: TableState): void {
  const dealerBJ = isBlackjack(state.dealer);
  const dealerT = handTotal(state.dealer).total;
  let roundNet = 0;
  const summaries: RoundHandSummary[] = [];
  for (const hand of state.hands) {
    const naturalBJ = !hand.fromSplit && isBlackjack(hand.cards);
    const res = settleHand({
      playerCards: hand.cards,
      dealerCards: state.dealer,
      wager: hand.bet,
      playerBlackjack: naturalBJ,
      dealerBlackjack: dealerBJ,
    });
    hand.outcome = res.outcome;
    hand.payout = res.payout;
    state.bank += res.payout;
    roundNet += res.net;
    summaries.push({ outcome: res.outcome, total: handTotal(hand.cards).total, bet: hand.bet, net: res.net });
  }
  let insuranceNet = 0;
  if (state.insuranceBet > 0) {
    const ins = settleInsurance(state.insuranceBet, dealerBJ);
    state.bank += ins.payout;
    insuranceNet = ins.net;
    roundNet += ins.net;
  }
  const wonThisRound = summaries.filter((s) => s.outcome === "win" || s.outcome === "blackjack").length;
  state.totalWon += wonThisRound;
  if (roundNet > 0) state.streak += 1;
  else if (roundNet < 0) state.streak = 0;
  state.records = {
    peakBank: Math.max(state.records.peakBank, state.bank),
    bestStreak: Math.max(state.records.bestStreak, state.streak),
    handsWon: state.totalWon,
  };
  state.history = [
    { id: state.roundId, dealerTotal: dealerT, dealerBust: dealerT > 21, hands: summaries, net: roundNet, insuranceNet },
    ...state.history,
  ].slice(0, 12);
  state.roundId += 1;
  state.dealerHoleShown = true;
  state.hint = null;
  state.phase = "settle";
}

export function newRound(state: TableState): void {
  if (state.phase !== "settle") return;
  state.phase = "betting";
  state.hands = [];
  state.dealer = [];
  state.activeHand = 0;
  state.dealerHoleShown = false;
  state.insuranceOffered = false;
  state.insuranceBet = 0;
  state.hint = null;
  state.message = null;
  state.justShuffled = false;
  if (state.bet > state.bank) state.bet = 0;
}

export function rebuy(state: TableState): void {
  if (state.bank >= MIN_BET) return;
  state.bank = START_BANK;
  state.records = { ...state.records, peakBank: Math.max(state.records.peakBank, START_BANK) };
  state.message = "Rebought in for 1,000 chips";
}

export function computeHint(state: TableState): Action | null {
  if (state.phase !== "player") return null;
  const hand = state.hands[state.activeHand];
  const up = state.dealer[0];
  if (up === undefined) return null;
  return basicStrategy(hand.cards, up, { canDouble: canDouble(state), canSplit: canSplit(state) });
}

export function canDeal(state: TableState): boolean {
  return state.phase === "betting" && state.bet >= MIN_BET && state.bet <= state.bank;
}

export function canHit(state: TableState): boolean {
  return state.phase === "player";
}

export function canStand(state: TableState): boolean {
  return state.phase === "player";
}

export function canDouble(state: TableState): boolean {
  if (state.phase !== "player") return false;
  const hand = state.hands[state.activeHand];
  return hand.cards.length === 2 && !hand.isSplitAces && state.bank >= hand.bet;
}

export function canSplit(state: TableState): boolean {
  if (state.phase !== "player") return false;
  const hand = state.hands[state.activeHand];
  if (hand.cards.length !== 2) return false;
  if (state.hands.length >= MAX_HANDS) return false;
  if (state.bank < hand.bet) return false;
  return cardValue(hand.cards[0].rank) === cardValue(hand.cards[1].rank);
}

export function needsRebuy(state: TableState): boolean {
  return state.phase === "betting" && state.bank < MIN_BET;
}
