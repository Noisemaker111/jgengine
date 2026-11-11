import { expect, test } from "bun:test";
import { FIXTURE_STATES, runeUiFixture } from "../../../proofs/runeUiFixture";

const expected: Partial<Record<(typeof FIXTURE_STATES)[number], string>> = {
  title: "New run", continue: "parts bolted on", calendar: "Yard calendar", garage: "Pit garage", records: "Corridor records",
  settings: "Master volume", credits: "Original Drift Foundry art", hud: "AT RISK", pause: "Back to the run",
  "pause-garage": "Pit garage", "pause-settings": "Restart run", "settings-sheet": "Master volume", result: "BACK TO PIT",
};
test("every Drift Foundry UI state serializes native elements at desktop and phone widths", async () => {
  for (const [width, height] of [[1280, 720], [390, 844]] as const) {
    for (const state of FIXTURE_STATES) {
      const spec = await runeUiFixture(state, width, height);
      const json = JSON.stringify(spec);
      expect(spec.children.length, `${state} at ${width}`).toBeGreaterThan(0);
      expect(/"k":"x"|className|cssText|getComputedStyle|"style":/.test(json), `${state} at ${width} has DOM or CSS`).toBe(false);
      expect(json.includes(expected[state] ?? ""), `${state} at ${width} shows ${expected[state]}`).toBe(true);
    }
  }
}, 60000);
