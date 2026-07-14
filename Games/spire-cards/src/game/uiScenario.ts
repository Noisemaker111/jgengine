import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { combatHandle } from "./combat";

export const uiScenario: UiPreviewScenario = (ctx) => {
  const combat = combatHandle.read(ctx);
  for (let played = 0; played < 2; played += 1) {
    const affordable = combat.getSnapshot().hand.find((entry) => combat.canPlay(entry.id) === null);
    if (affordable === undefined) break;
    ctx.game.commands.run("playCard", { cardId: affordable.id });
  }
  ctx.game.commands.run("endTurn", {});
};
