import { expect, test } from "bun:test";
import { NATIVE_STATES, runeUiFixture } from "../../../proofs/runeUiFixture";

const expected: Partial<Record<(typeof NATIVE_STATES)[number], string>> = {
  title: "New Defense",
  new: "Commission",
  keeps: "Unclaimed",
  settings: "Master volume",
  credits: "JGengine",
  hud: "Begin first assault",
  midwave: "WAVE",
  tower: "Aim:",
  breached: "Mend",
  paused: "Hold the line",
  result: "War Council",
};

test("every Beacon Bastion UI state serializes native elements at desktop and phone widths", async () => {
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
