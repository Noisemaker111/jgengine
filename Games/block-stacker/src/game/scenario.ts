import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import { blockStackerStore } from "./tetris/store";

export const blockStackerUiScenario: UiPreviewScenario = () => {
  blockStackerStore.reset("preview");
  const layout: { dx: number; rot: number }[] = [
    { dx: -4, rot: 0 },
    { dx: -2, rot: 1 },
    { dx: 0, rot: 0 },
    { dx: 2, rot: 1 },
    { dx: 4, rot: 0 },
    { dx: -3, rot: 0 },
  ];
  for (const { dx, rot } of layout) {
    if (rot !== 0) blockStackerStore.rotate(1);
    blockStackerStore.shift(dx);
    blockStackerStore.hardDrop();
  }
  blockStackerStore.shift(-1);
  blockStackerStore.rotate(1);
};
