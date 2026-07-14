import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { starInvadersHandle } from "./invaders/store";

export const starInvadersUiScenario: UiPreviewScenario = (ctx) => {
  starInvadersHandle.read(ctx).preview();
};
