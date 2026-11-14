import { expect, test } from "bun:test";
import { NATIVE_STATES, runeUiFixture } from "../../../proofs/runeUiFixture";

const expected: Partial<Record<(typeof NATIVE_STATES)[number], string>> = {
  title: "Wake the haunt", new: "Scenarios open one after another", saves: "Return to this haunt", settings: "Master volume", credits: "KayKit City Builder",
  hud: "NEXT STEP", inspector: "Tear down", guest: "NERVE", books: "The ledger", research: "Channel the beyond", paused: "Resume the night",
  "pause-settings": "Reduce motion", help: "Pan with WASD", won: "The night is yours", bankrupt: "The haunt has faded", ribbon: "A ghost paradise!",
};

test("every Hauntworks UI state serializes native elements at desktop and phone widths", async () => {
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
