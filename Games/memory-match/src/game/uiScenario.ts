import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { getRound } from "./match/round";

export const uiScenario: UiPreviewScenario = (ctx) => {
  ctx.game.commands.run("newGame", { sizeId: "4x4", seed: "preview" });
  const round = getRound(ctx);
  if (round === null) return;

  const indicesByPair = new Map<number, number[]>();
  round.board.cards.forEach((card, index) => {
    const bucket = indicesByPair.get(card.pairId) ?? [];
    bucket.push(index);
    indicesByPair.set(card.pairId, bucket);
  });

  const pairs = [...indicesByPair.values()];
  for (const pair of pairs.slice(0, 2)) {
    for (const index of pair) ctx.game.commands.run("flipCard", { index });
  }
  const teaser = pairs[2]?.[0];
  if (teaser !== undefined) ctx.game.commands.run("flipCard", { index: teaser });
};
