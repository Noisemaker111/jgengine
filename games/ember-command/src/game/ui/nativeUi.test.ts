import { expect, test } from "bun:test";
import { NATIVE_FIXTURES, runeUiFixture } from "../../../proofs/runeUiFixture";

test("every Ember Command UI state serializes native elements at desktop and phone widths", async () => {
  for (const [width, height] of [[1280, 720], [390, 844]] as const) {
    for (const state of NATIVE_FIXTURES) {
      const spec = await runeUiFixture(state, width, height);
      const json = JSON.stringify(spec);
      expect(spec.children.length, `${state} at ${width}`).toBeGreaterThan(0);
      expect(json, `${state} at ${width}`).not.toMatch(/"k":"x"|className|cssText|getComputedStyle|"style":/);
      const expects: Partial<Record<(typeof NATIVE_FIXTURES)[number], string[]>> = {
        hud: ["Ledger", "Bram the Bold", "Train Peasant", "Pause battle", width > 700 ? "Battlefield minimap" : "Show map"],
        levelup: ["Bram reaches level 2"],
        build: ["place the Barracks"],
        paused: ["Orders on hold", "Resume the mission", "Return to title"],
        "paused-settings": ["Field preferences", "Master volume"],
        title: ["Take command", "New campaign", "Free skirmish", "March out"],
        new: ["Seal the commission", "Draw a name"],
        skirmish: ["Into the vale"],
        records: ["Campaign I", "Campaign III"],
        settings: ["Larger HUD text", "Master volume"],
        credits: ["game-icons.net"],
        report: ["The vale is yours", "6:52"],
      };
      for (const text of expects[state] ?? []) expect(json, `${state} at ${width} shows ${text}`).toContain(text);
    }
  }
}, 60000);
