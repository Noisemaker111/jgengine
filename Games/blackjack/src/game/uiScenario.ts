import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import type { Card } from "./rules/deck";
import { createInitialState } from "./state/machine";
import type { HandState, RoundResult, TableState } from "./state/machine";

const card = (rank: Card["rank"], suit: Card["suit"]): Card => ({ rank, suit });

function hand(cards: Card[], extra: Partial<HandState> = {}): HandState {
  return { cards, bet: 100, doubled: false, fromSplit: false, isSplitAces: false, done: false, outcome: null, payout: 0, ...extra };
}

function previewState(): TableState {
  const base = createInitialState("blackjack-preview");
  const history: RoundResult[] = [
    { id: 3, dealerTotal: 23, dealerBust: true, hands: [{ outcome: "win", total: 19, bet: 100, net: 100 }], net: 100, insuranceNet: 0 },
    { id: 2, dealerTotal: 20, dealerBust: false, hands: [{ outcome: "blackjack", total: 21, bet: 150, net: 225 }], net: 225, insuranceNet: 0 },
    { id: 1, dealerTotal: 18, dealerBust: false, hands: [{ outcome: "lose", total: 16, bet: 100, net: -100 }], net: -100, insuranceNet: 0 },
  ];
  return {
    ...base,
    phase: "player",
    bank: 1240,
    bet: 100,
    hands: [
      hand([card("8", "S"), card("K", "H")], { fromSplit: true, done: true }),
      hand([card("8", "D"), card("3", "C")], { fromSplit: true }),
    ],
    activeHand: 1,
    dealer: [card("6", "D"), card("10", "S")],
    dealerHoleShown: false,
    hint: "double",
    history,
    streak: 2,
    totalWon: 27,
    records: { peakBank: 1500, bestStreak: 4, handsWon: 27 },
    shoe: { ...base.shoe, pos: 96 },
    roundId: 4,
  };
}

export const uiScenario: UiPreviewScenario = (ctx) => {
  ctx.game.store.set("bj", previewState());
};
