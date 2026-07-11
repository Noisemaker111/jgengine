import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { starInvadersStore } from "./invaders/store";

export const starInvadersUiScenario: UiPreviewScenario = () => {
  starInvadersStore.preview();
};
