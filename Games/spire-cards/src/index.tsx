import type { PlayableGame } from "@jgengine/shell/registry";
import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { combat } from "./combat";
import { content } from "./content";
import { game } from "./game.config";
import { onInit, onNewPlayer, onTick } from "./loop";
import { GameUI } from "./ui/GameUI";

export const spireCardsGame: PlayableGame = {
  game,
  content,
  loop: { onInit, onNewPlayer, onTick },
  GameUI,
  camera: { followEntityId: null },
};

export const uiScenario: UiPreviewScenario = (ctx) => {
  for (let played = 0; played < 2; played += 1) {
    const affordable = combat.getSnapshot().hand.find((entry) => combat.canPlay(entry.id) === null);
    if (affordable === undefined) break;
    ctx.game.commands.run("playCard", { cardId: affordable.id });
  }
  ctx.game.commands.run("endTurn", {});
};

export default spireCardsGame;
