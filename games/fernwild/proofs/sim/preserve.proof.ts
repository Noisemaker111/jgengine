import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// A preserving bin keeps food four times as long as carrying it. Setup places one with a raw meat on the
// hotbar and another in the bag; play opens the bin, puts the bag's meat in, and waits: the carried meat
// spoils at ten minutes, and a minute after that the meat in the bin is still raw.
export default defineProof(game, {
  proves: ["crafting.preserve"],
  setup(s) {
    s.waitFor((p) => p.creatures > 0, { timeoutMs: 60_000 });
    s.command("cheat", { give: { preserving_bin: 1, raw_meat: 1 }, toHotbar: ["preserving_bin", "raw_meat"] });
    s.press("Digit1");
    s.hold("mouse0", { until: (p) => p.bins > 0, ms: 80, timeoutMs: 3000 });
    s.command("cheat", { give: { raw_meat: 1 } });
  },
  async play(p) {
    await p.expect((r) => r.bins === 1 && r.meatSlot >= 0, "a preserving bin stands in front, with raw meat in the bag and on the hotbar");
    await p.press("KeyE");
    await p.waitFor((r) => r.storedMeat === 0, { timeoutMs: 3000, note: "E opens the empty bin" });
    await p.act("storePut", { inventoryId: "inventory", slot: (await p.probe()).meatSlot });
    await p.expect((r) => r.storedMeat === 1, "the meat goes into the bin");
    await p.waitFor((r) => r.spoiledMeat >= 1, { timeoutMs: 620_000, note: "the carried meat spoils" });
    // The bin's meat went in a few seconds after the carried meat started going off; a minute on, it would be gone too.
    await p.wait(60_000);
    await p.expect((r) => r.storedMeat === 1, "a minute later the meat in the bin is still raw");
  },
});
