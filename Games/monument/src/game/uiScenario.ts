import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { advanceGrowth, setWelcomeOpen } from "./city/state";

export const uiScenario: UiPreviewScenario = (ctx) => {
  setWelcomeOpen(ctx, false);
  ctx.game.store.set("briefStage", 1);
  advanceGrowth(ctx);
};
