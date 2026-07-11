import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { freecellStore } from "../freecell/store";

// Stage a believable mid-game: deal #1, let a few smart moves send aces up and
// stack the tableau, then leave one run selected so the highlight shows.
export const uiScenario: UiPreviewScenario = () => {
  freecellStore.newDeal(1);
  for (let pass = 0; pass < 3; pass += 1) {
    const state = freecellStore.getState();
    state.cascades.forEach((col, c) => {
      if (col.length > 0) freecellStore.smartMove({ t: "cascadeCard", col: c, row: col.length - 1 });
    });
  }
  const state = freecellStore.getState();
  const target = state.cascades.findIndex((c) => c.length > 0);
  if (target >= 0) {
    freecellStore.onClick({ t: "cascadeCard", col: target, row: state.cascades[target]!.length - 1 });
  }
};
