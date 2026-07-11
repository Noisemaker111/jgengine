import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { brickBreakerStore } from "./breakout/store";

export const brickBreakerUiScenario: UiPreviewScenario = () => {
  brickBreakerStore.preview();
};
