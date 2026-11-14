import { expect, test } from "bun:test";
import { runeUiFixture, type NativeFixture } from "../../../proofs/runeUiFixture";

const states: readonly NativeFixture[] = ["home","run","stash","workbench","nook","pack","title","settings","credits","paused","caught","saving","blocked"];
test("every Crumb Run UI state serializes native elements at desktop and phone widths", async () => {
  for (const [width,height] of [[1280,720],[390,844]]) {
    for (const state of states) {
      const spec = await runeUiFixture(state, width, height);
      const json = JSON.stringify(spec);
      expect(spec.children.length, `${state} at ${width}`).toBeGreaterThan(0);
      expect(json, `${state} at ${width}`).not.toMatch(/"k":"x"|className|cssText|getComputedStyle|"style":/);
      if (state === "settings") expect(json).toContain("Master volume");
      if (state === "credits") expect(json).toContain("Crumb Run");
      if (state === "title") expect(json).toContain("CRUMB RUN");
      if (state === "stash") expect(json).toContain("matchbox stash");
      if (state === "workbench") expect(json).toContain("Map room");
      if (state === "nook") expect(json).toContain("Wren");
      if (state === "pack") expect(json).toContain("Your pack");
      if (state === "run") expect(json).toContain("HEALTH");
    }
  }
}, 20000);
