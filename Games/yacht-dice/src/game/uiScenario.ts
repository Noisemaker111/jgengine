import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { STORE_KEY } from "../loop";
import { createGame, type YachtState } from "./state/game";

export const uiScenario: UiPreviewScenario = (ctx) => {
  const base = createGame("yacht-demo", false, 271, {
    sixes: 24,
    fours: 16,
    fullHouse: 25,
    largeStraight: 40,
    yacht: 50,
    chance: 29,
  });
  const staged: YachtState = {
    ...base,
    dice: [5, 5, 5, 2, 3],
    held: [true, true, false, false, false],
    spins: [1, 1, 2, 2, 2],
    draws: 8,
    rollsLeft: 1,
    hasRolled: true,
    sheet: {
      scores: { ones: 4, twos: 6, threes: 6, fours: 12, fullHouse: 25, smallStraight: 30, yacht: 50 },
      yachtBonus: 0,
    },
  };
  ctx.game.store.set(STORE_KEY, staged);
};
