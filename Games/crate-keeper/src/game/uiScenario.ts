import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { LEVELS } from "./levels";
import { keeperStore } from "./store";

const PREVIEW_INDEX = 10;

export const uiScenario: UiPreviewScenario = () => {
  const solution = LEVELS[PREVIEW_INDEX].solution;
  keeperStore.preview(PREVIEW_INDEX, solution.slice(0, -2));
};
