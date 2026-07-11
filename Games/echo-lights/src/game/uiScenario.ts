import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";

import type { PadIndex } from "./echo/catalog";
import { setRun } from "./echo/run";
import { sequencePads } from "./echo/sequence";

export const uiScenario: UiPreviewScenario = (ctx) => {
  const now = ctx.time.now();
  const sequence = sequencePads("preview", 6);
  const lastPressed: PadIndex = sequence[1] ?? 0;
  setRun(ctx, {
    mode: "classic",
    seed: "preview",
    daily: false,
    sequence,
    phase: "recall",
    playIndex: sequence.length,
    inputIndex: 2,
    litPad: lastPressed,
    litKind: "press",
    litUntil: now + 300,
    nextAt: null,
    missPad: null,
    completed: 5,
    bests: null,
  });
};
