import { expect, test } from "bun:test";
import { ORBIT_FIXTURES, runeUiFixture } from "../../../proofs/runeUiFixture";

const expected: Partial<Record<(typeof ORBIT_FIXTURES)[number], string>> = {
  title: "NO VACANCY",
  new: "Opening night",
  households: "House II",
  guide: "Running a boarding house in orbit",
  settings: "Master volume",
  credits: "Comfortaa",
  hud: "Rooms",
  member: "Day job & mastery",
  furnish: "Furnish the commons",
  pantry: "Taken in today",
  rooms: "Rooms plan",
  applicant: "BUZZ AT THE AIRLOCK",
  transmission: "FRONT DESK",
  review: "OFFICE OF THE DOCKMASTER",
  paused: "Back to the front desk",
  "pause-save": "Write today down",
  "pause-settings": "Calm interface",
  "settings-sheet": "Mute",
};

test("every NO VACANCY UI state serializes native elements at desktop and phone widths", async () => {
  for (const [width, height] of [[1280, 720], [390, 844]] as const) {
    for (const state of ORBIT_FIXTURES) {
      const spec = await runeUiFixture(state, width, height);
      const json = JSON.stringify(spec);
      expect(spec.children.length, `${state} at ${width}`).toBeGreaterThan(0);
      expect(json, `${state} at ${width}`).not.toMatch(/"k":"x"|className|cssText|getComputedStyle|"style":/);
      const want = expected[state];
      if (want !== undefined) expect(json, `${state} at ${width}`).toContain(want);
    }
  }
}, 60000);
