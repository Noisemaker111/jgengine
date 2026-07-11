import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { blasterStore } from "./blaster/store";

export const uiScenario: UiPreviewScenario = () => {
  blasterStore.preview();
};
