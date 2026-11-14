import { expect, test } from "bun:test";
import { FIXTURE_STATES, runeUiFixture } from "../../../proofs/runeUiFixture";

const expected: Partial<Record<(typeof FIXTURE_STATES)[number], string>> = {
  title: "New run", continue: "mods fitted", calendar: "Weekly circular", corral: "Mobility Scooter Cart", garage: "Customer service", records: "Store records",
  settings: "Master volume", credits: "Original Cleanup on Aisle 9 art", hud: "AT RISK", pause: "Back to the run",
  "pause-garage": "Customer service", "pause-settings": "Restart run", "settings-sheet": "Master volume", result: "CUSTOMER SERVICE",
};
test("every Cleanup on Aisle 9 UI state serializes native elements at desktop and phone widths", async () => {
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
