import { defineProof } from "@jgengine/core/suite/suiteProof";

import { game } from "../../src/game.config";

// A storage box is a placed piece that keeps what you put in it. Setup places one in front of the survivor
// with stone in the bag; play opens it with E, puts the stone in, walks away from the screen, opens it again
// to find the stone still there, and takes it back out.
export default defineProof(game, {
  proves: ["survival.storage-place"],
  setup(s) {
    s.waitFor((p) => p.creatures > 0, { timeoutMs: 60_000 });
    s.command("cheat", { give: { storage_box: 1, stone: 40 }, toHotbar: ["storage_box"] });
    s.press("Digit1");
    s.hold("mouse0", { until: (p) => p.boxes > 0, ms: 80, timeoutMs: 3000 });
  },
  async play(p) {
    await p.expect((r) => r.boxes === 1 && r.stone === 40, "a storage box stands in front and the bag holds 40 stone");
    await p.press("KeyE");
    await p.waitFor((r) => r.screen === 1 && r.stored === 0, { timeoutMs: 3000, note: "E opens the empty box" });
    await p.act("storePut", { inventoryId: "inventory", slot: (await p.probe()).stoneSlot });
    await p.expect((r) => r.stored === 40 && r.stone === 0, "the stone goes into the box");
    await p.act("closeStore", {});
    await p.expect((r) => r.screen === 0 && r.stored === -1, "the box closes");
    await p.press("KeyE");
    await p.waitFor((r) => r.stored === 40, { timeoutMs: 3000, note: "opened again, the stone is still there" });
    await p.act("storeTake", { slot: 0 });
    await p.expect((r) => r.stored === 0 && r.stone === 40, "the stone comes back to the bag");
  },
});
