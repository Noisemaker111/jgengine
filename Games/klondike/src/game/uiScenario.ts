import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

export const uiScenario: UiPreviewScenario = (ctx) => {
  ctx.game.commands.run("deal", { seed: "klondike-preview", seedSource: "seed", drawMode: 1 });
  for (let i = 0; i < 3; i += 1) ctx.game.commands.run("draw", {});
  ctx.game.commands.run("smartMove", { source: { zone: "waste" } });
  for (let pile = 0; pile < 7; pile += 1) {
    ctx.game.commands.run("smartMove", { source: { zone: "tableau", pile, index: pile } });
  }
};
