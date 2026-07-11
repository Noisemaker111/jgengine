import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { store } from "./puzzle/store";

export const uiScenario: UiPreviewScenario = () => {
  store.preview();
};
