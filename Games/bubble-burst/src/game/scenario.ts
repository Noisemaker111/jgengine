import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { bubbleStore } from "./bubble/store";

export const bubbleUiScenario: UiPreviewScenario = () => {
  bubbleStore.preview();
};
