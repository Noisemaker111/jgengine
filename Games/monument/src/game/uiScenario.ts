import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { advanceGrowth } from "./city/state";

export const uiScenario: UiPreviewScenario = (ctx) => {
  ctx.game.store.set("briefStage", 1);
  advanceGrowth(ctx);
};
