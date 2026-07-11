import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { generateDeal } from "./mahjong/deal";

// Stages the full playing HUD mid-deal: most of the turtle cleared, one tile
// selected, counters/controls/credit all live.
export const uiScenario: UiPreviewScenario = (ctx) => {
  const seed = "mahjong-preview";
  ctx.game.commands.run("deal", { seed, source: "seed" });

  const { solution } = generateDeal(seed);
  const cleared = 26;
  for (let i = 0; i < cleared; i += 1) {
    const [a, b] = solution[i];
    ctx.game.commands.run("pick", { slotId: a });
    ctx.game.commands.run("pick", { slotId: b });
  }
  // Leave one free tile selected so the selection affordance is on screen.
  ctx.game.commands.run("pick", { slotId: solution[cleared][0] });
};
