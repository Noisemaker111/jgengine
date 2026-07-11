import { dailySeed } from "@jgengine/core/random/seedLink";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import {
  CHIP_DENOMS,
  clearBet,
  computeHint,
  createInitialState,
  deal,
  dealerStep,
  double,
  hit,
  newRound,
  placeBet,
  rebuy,
  resolveInsurance,
  split,
  stand,
} from "./game/state/machine";
import type { TableState } from "./game/state/machine";
import { loadBank, loadRecords, saveBank, saveRecords } from "./game/state/persistence";

export const STORE_KEY = "bj";

function read(ctx: GameContext): TableState | undefined {
  return ctx.game.store.get(STORE_KEY) as TableState | undefined;
}

function commit(ctx: GameContext, mutate: (state: TableState) => void): void {
  const current = read(ctx);
  if (current === undefined) return;
  const next = structuredClone(current);
  const prevBank = next.bank;
  const prevPhase = next.phase;
  mutate(next);
  if (next.bank !== prevBank) saveBank(next.bank);
  if (prevPhase !== "settle" && next.phase === "settle") saveRecords(next.records);
  ctx.game.store.set(STORE_KEY, next);
}

export function onInit(ctx: GameContext): void {
  const verb = (name: string, run: (state: TableState) => void): void => {
    ctx.game.commands.define(name, {
      apply: (context) => {
        commit(context, run);
      },
    });
  };

  verb("deal", deal);
  verb("hit", hit);
  verb("stand", stand);
  verb("double", double);
  verb("split", split);
  verb("newRound", newRound);
  verb("rebuy", rebuy);
  verb("clearBet", clearBet);
  verb("insureYes", (state) => resolveInsurance(state, true));
  verb("insureNo", (state) => resolveInsurance(state, false));
  verb("hint", (state) => {
    state.hint = computeHint(state);
  });

  ctx.game.commands.define<{ amount?: number }>("bet", {
    apply: (context, input) => {
      commit(context, (state) => placeBet(state, input.amount ?? 0));
    },
  });

  CHIP_DENOMS.forEach((amount, index) => {
    ctx.game.commands.define(`chip${index + 1}`, {
      apply: (context) => {
        commit(context, (state) => placeBet(state, amount));
      },
    });
  });
}

export function onNewPlayer(ctx: GameContext): void {
  const seed = dailySeed(Date.now(), "blackjack");
  ctx.game.store.set(STORE_KEY, createInitialState(seed, { bank: loadBank(), records: loadRecords() }));
}

export function onTick(ctx: GameContext): void {
  const state = read(ctx);
  if (state === undefined || state.phase !== "dealer") return;
  const now = ctx.time.now();
  if (now < state.dealerDrawAt) return;
  commit(ctx, (draft) => dealerStep(draft, now));
}
