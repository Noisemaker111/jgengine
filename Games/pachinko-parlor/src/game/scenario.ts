import type { UiPreviewScenario } from "@jgengine/shell/GameUiPreview";
import { pachinkoStore } from "./store";

export const uiScenario: UiPreviewScenario = () => {
  const store = pachinkoStore;
  store.reset("preview-showcase");
  const sim = store.sim;

  for (let k = 0; k < 12; k += 1) {
    sim.launch(0.5 + (k % 5) * 0.04);
    for (let i = 0; i < 900 && sim.liveBalls() > 0; i += 1) sim.step(1 / 120);
  }

  for (let k = 0; k < 9; k += 1) {
    sim.launch(0.62 + (k % 3) * 0.03);
    for (let i = 0; i < 34; i += 1) sim.step(1 / 120);
  }

  sim.feverActive = true;
  sim.feverTimer = 12;
  if (sim.feverCount < 2) sim.feverCount = 2;
  sim.autoFire = true;
  store.sync();
};
