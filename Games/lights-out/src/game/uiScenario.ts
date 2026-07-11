import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { store } from "./state";

export const uiScenario: UiPreviewScenario = () => {
  store.preview();
};
