import { expect, test } from "bun:test";
import { ORBIT_FIXTURES, runeUiFixture } from "../../../proofs/runeUiFixture";

const expected: Partial<Record<(typeof ORBIT_FIXTURES)[number], string>> = {
  title: "Odd Orbit",
  new: "Moving-in card",
  households: "Household II",
  guide: "Caring for a strange household",
  settings: "Master volume",
  credits: "Comfortaa",
  hud: "Furnish",
  member: "Post & mastery",
  furnish: "Make room for life",
  pantry: "Earned today",
  transmission: "INCOMING TRANSMISSION",
  review: "HABITAT AUTHORITY",
  paused: "Back to the household",
  "pause-save": "Write today down",
  "pause-settings": "Calm interface",
  "settings-sheet": "Mute",
};

test("every Odd Orbit UI state serializes native elements at desktop and phone widths", async () => {
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
