import { cardValue, type Card } from "./deck";
import { handTotal } from "./scoring";

export type Action = "hit" | "stand" | "double" | "split";

export interface StrategyOptions {
  readonly canDouble: boolean;
  readonly canSplit: boolean;
}

const inRange = (value: number, lo: number, hi: number): boolean => value >= lo && value <= hi;

function pairValue(cards: readonly Card[]): number | null {
  if (cards.length !== 2) return null;
  const [a, b] = cards;
  if (a === undefined || b === undefined) return null;
  const va = cardValue(a.rank);
  const vb = cardValue(b.rank);
  return va === vb ? va : null;
}

function shouldSplit(pair: number, up: number): boolean {
  switch (pair) {
    case 11:
      return true;
    case 10:
      return false;
    case 9:
      return inRange(up, 2, 6) || up === 8 || up === 9;
    case 8:
      return true;
    case 7:
      return inRange(up, 2, 7);
    case 6:
      return inRange(up, 2, 6);
    case 5:
      return false;
    case 4:
      return inRange(up, 5, 6);
    case 3:
    case 2:
      return inRange(up, 2, 7);
    default:
      return false;
  }
}

function resolveSoft(total: number, up: number, canDouble: boolean): Action {
  if (total >= 19) return "stand";
  if (total === 18) {
    if (inRange(up, 2, 6)) return canDouble ? "double" : "stand";
    if (up === 7 || up === 8) return "stand";
    return "hit";
  }
  const doubleBand: Record<number, readonly [number, number]> = {
    17: [3, 6],
    16: [4, 6],
    15: [4, 6],
    14: [5, 6],
    13: [5, 6],
  };
  const band = doubleBand[total];
  if (band !== undefined && canDouble && inRange(up, band[0], band[1])) return "double";
  return "hit";
}

function resolveHard(total: number, up: number, canDouble: boolean): Action {
  if (total >= 17) return "stand";
  if (inRange(total, 13, 16)) return inRange(up, 2, 6) ? "stand" : "hit";
  if (total === 12) return inRange(up, 4, 6) ? "stand" : "hit";
  if (total === 11) return canDouble ? "double" : "hit";
  if (total === 10) return canDouble && inRange(up, 2, 9) ? "double" : "hit";
  if (total === 9) return canDouble && inRange(up, 3, 6) ? "double" : "hit";
  return "hit";
}

export function basicStrategy(
  playerCards: readonly Card[],
  dealerUpcard: Card,
  options: StrategyOptions,
): Action {
  const up = cardValue(dealerUpcard.rank);
  const pair = pairValue(playerCards);
  if (pair !== null && options.canSplit && shouldSplit(pair, up)) return "split";
  const { total, soft } = handTotal(playerCards);
  return soft ? resolveSoft(total, up, options.canDouble) : resolveHard(total, up, options.canDouble);
}

const ACTION_LABEL: Record<Action, string> = {
  hit: "Hit",
  stand: "Stand",
  double: "Double Down",
  split: "Split",
};

export function actionLabel(action: Action): string {
  return ACTION_LABEL[action];
}
