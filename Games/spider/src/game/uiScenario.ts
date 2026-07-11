import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

export const uiScenario: UiPreviewScenario = (ctx) => {
  ctx.game.commands.run("deal", { seed: "spider-preview", seedSource: "seed", suits: 2 });
  for (let pass = 0; pass < 2; pass += 1) {
    for (let pile = 0; pile < 10; pile += 1) {
      const index = pile < 4 ? 5 : 4;
      ctx.game.commands.run("smartMove", { source: { pile, index } });
    }
  }
};
