import { expect, test } from "bun:test";
import { NATIVE_STATES, runeUiFixture } from "../../../proofs/runeUiFixture";

const expected: Partial<Record<(typeof NATIVE_STATES)[number], string>> = {
  title: "Open the park", new: "Scenarios open one after another", saves: "Load this park", settings: "Master volume", credits: "KayKit City Builder",
  hud: "NEXT STEP", inspector: "Demolish", guest: "MOOD", books: "Park books", research: "Research", paused: "Resume the park",
  "pause-settings": "Reduce motion", help: "Pan with WASD", won: "Scenario won!", bankrupt: "Park bankrupt", ribbon: "Blue ribbon!",
};

test("every Brightway UI state serializes native elements at desktop and phone widths", async () => {
  for (const [width, height] of [[1280, 720], [390, 844]] as const) {
    for (const state of NATIVE_STATES) {
      const spec = await runeUiFixture(state, width, height);
      const json = JSON.stringify(spec);
      expect(spec.children.length, `${state} at ${width}`).toBeGreaterThan(0);
      expect(json, `${state} at ${width}`).not.toMatch(/"k":"x"|className|cssText|getComputedStyle|"style":/);
      expect(json, `${state} at ${width}`).toContain(expected[state]!);
    }
  }
}, 30000);
