import type { Card } from "./deck";
import { handTotal, isBust } from "./scoring";

export type Outcome = "blackjack" | "win" | "push" | "lose";

export interface HandResult {
  readonly outcome: Outcome;
  readonly payout: number;
  readonly net: number;
}

function result(outcome: Outcome, payout: number, wager: number): HandResult {
  return { outcome, payout, net: payout - wager };
}

export function settleHand(args: {
  playerCards: readonly Card[];
  dealerCards: readonly Card[];
  wager: number;
  playerBlackjack: boolean;
  dealerBlackjack: boolean;
}): HandResult {
  const { playerCards, dealerCards, wager, playerBlackjack, dealerBlackjack } = args;
  if (isBust(playerCards)) return result("lose", 0, wager);
  if (playerBlackjack && dealerBlackjack) return result("push", wager, wager);
  if (playerBlackjack) return result("blackjack", wager + wager * 1.5, wager);
  if (dealerBlackjack) return result("lose", 0, wager);
  const player = handTotal(playerCards).total;
  const dealer = handTotal(dealerCards).total;
  if (dealer > 21) return result("win", wager * 2, wager);
  if (player > dealer) return result("win", wager * 2, wager);
  if (player < dealer) return result("lose", 0, wager);
  return result("push", wager, wager);
}

export interface InsuranceResult {
  readonly payout: number;
  readonly net: number;
}

export function settleInsurance(insuranceBet: number, dealerBlackjack: boolean): InsuranceResult {
  if (insuranceBet <= 0) return { payout: 0, net: 0 };
  if (dealerBlackjack) return { payout: insuranceBet * 3, net: insuranceBet * 2 };
  return { payout: 0, net: -insuranceBet };
}
