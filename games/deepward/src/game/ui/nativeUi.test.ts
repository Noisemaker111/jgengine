import { expect, test } from "bun:test";
import { runeUiFixture, type NativeFixture } from "../../../proofs/runeUiFixture";

const states: readonly NativeFixture[] = ["home","dive","stash","fabricator","cache","title","settings","credits","paused","reprinting","saving","blocked"];
test("every Deepward UI state serializes native elements at desktop and phone widths", async () => {
  for (const [width,height] of [[1280,720],[390,844]]) {
    for (const state of states) {
      const spec = await runeUiFixture(state, width, height);
      const json = JSON.stringify(spec);
      expect(spec.children.length, `${state} at ${width}`).toBeGreaterThan(0);
      expect(json, `${state} at ${width}`).not.toMatch(/"k":"x"|className|cssText|getComputedStyle|"style":/);
      if (state === "settings") expect(json).toContain("Master volume");
      if (state === "credits") expect(json).toContain("ambientCG");
      if (state === "stash") expect(json).toContain("Marrow's stash");
      if (state === "cache") expect(json).toContain("Carried cache");
      if (state === "dive") expect(json).toContain("SEC AIR");
    }
  }
}, 20000);
