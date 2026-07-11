import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { snakeStore } from "./store";

export const uiScenario: UiPreviewScenario = () => {
  snakeStore.preview();
};
