import type { RecordBook } from "@jgengine/core/game/recordBook";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import type { MatchState } from "./state";

export type RecordField = "easy" | "medium" | "hard";

export const MATCH_KEY = "match";
export const RECORDS_KEY = "records";
export const REV_KEY = "rev";

export function getMatch(ctx: GameContext): MatchState {
  return ctx.game.store.get(MATCH_KEY) as MatchState;
}

export function getRecords(ctx: GameContext): RecordBook<RecordField> {
  return ctx.game.store.get(RECORDS_KEY) as RecordBook<RecordField>;
}

export function bumpUi(ctx: GameContext): void {
  const current = ctx.game.store.get(REV_KEY);
  ctx.game.store.set(REV_KEY, (typeof current === "number" ? current : 0) + 1);
}
