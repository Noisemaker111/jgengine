import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { selectInstance, setLens } from "./city/state";

export const uiScenario: UiPreviewScenario = (ctx) => {
  selectInstance(ctx, "b-seed-5");
  setLens(ctx, "program");
};
