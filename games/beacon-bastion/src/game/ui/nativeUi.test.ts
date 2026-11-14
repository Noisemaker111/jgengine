import { expect, test } from "bun:test";
import { NATIVE_STATES, runeUiFixture } from "../../../proofs/runeUiFixture";

const expected: Partial<Record<(typeof NATIVE_STATES)[number], string>> = {
  title: "New Day",
  new: "Time Card",
  keeps: "Closed for business",
  settings: "Master volume",
  credits: "JGengine",
  hud: "Open for business",
  midwave: "WAVE",
  tower: "Aim:",
  breached: "Coffee break",
  paused: "Back to work",
  result: "Town Council",
};

test("every Do Not Disturb UI state serializes native elements at desktop and phone widths", async () => {
  for (const [width, height] of [[1280, 720], [390, 844]] as const) {
    for (const state of NATIVE_STATES) {
      const spec = await runeUiFixture(state, width, height);
      const json = JSON.stringify(spec);
      expect(spec.children.length, `${state} at ${width}`).toBeGreaterThan(0);
      expect(json, `${state} at ${width}`).not.toMatch(/"k":"x"|className|cssText|getComputedStyle|"style":/);
      const word = expected[state];
      if (word !== undefined) expect(json, `${state} at ${width}`).toContain(word);
    }
  }
}, 60000);
