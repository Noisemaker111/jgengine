import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { roadHopperStore } from "./hopper/store";

export const roadHopperUiScenario: UiPreviewScenario = () => {
  roadHopperStore.preview();
};
