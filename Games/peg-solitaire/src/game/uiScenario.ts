import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { store } from "./peg/store";

export const uiScenario: UiPreviewScenario = () => {
  store.preview();
};
