import { expect, test } from "bun:test";

import { FIXTURES, runeUiFixture } from "../../../proofs/runeUiFixture";

const EXPECT: Partial<Record<(typeof FIXTURES)[number], string>> = {
  title: "New game",
  controls: "Whistle your tames to follow / stay",
  settings: "Master volume",
  credits: "Fernwild — made with JGengine.",
  creator: "Choose where you wake",
  hud: "Island",
  inventory: "Crafting",
  engrams: "engram points",
  dossier: "Explorer notes",
  creature: "· Tamed",
  storage: " slots",
  obelisk: "Green Obelisk",
  paused: "Quit to title",
};

test("every Fernwild UI state serializes native elements at desktop and phone widths", async () => {
  for (const [width, height] of [[1280, 720], [390, 844]] as const) {
    for (const state of FIXTURES) {
      const spec = await runeUiFixture(state, width, height);
      const json = JSON.stringify(spec);
      expect(spec.children.length, `${state} at ${width}`).toBeGreaterThan(0);
      expect(json, `${state} at ${width}`).not.toMatch(/"k":"x"|className|cssText|getComputedStyle|"style":/);
      const wanted = EXPECT[state];
      if (wanted !== undefined) expect(json, `${state} at ${width}`).toContain(wanted);
    }
  }
}, 120000);
