import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { selectInstance } from "./city/state";

export const uiScenario: UiPreviewScenario = (ctx) => {
  selectInstance(ctx, "b-seed-5");
};
