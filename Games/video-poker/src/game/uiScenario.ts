import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { poker } from "./poker";

export const uiScenario: UiPreviewScenario = (ctx) => {
  poker.reset();
  ctx.game.commands.run("betMax", {});
  ctx.game.commands.run("dealDraw", {});
  ctx.game.commands.run("hold1", {});
  ctx.game.commands.run("hold3", {});
  ctx.game.commands.run("hold5", {});
};
