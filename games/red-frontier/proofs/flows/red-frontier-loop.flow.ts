import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.see(/Boots on the dust/i, { timeoutMs: 60000, note: "arrival: the colony is up and the first story beat started by itself" });
    await f.waitFor((p) => p.people === 4, { timeoutMs: 10000, note: "arrival: 4 crew stand at the landing base" });
    // F selects everyone
    await f.press("KeyF");
    await f.waitFor((p) => p.selected === 4, { timeoutMs: 5000 });
    // right click open ground: they walk there
    await f.clickAt(900, 300, { button: "right" });
    await f.waitFor((p) => p.moving >= 1, { timeoutMs: 5000 });
    // G sends the selected to the nearest node
    await f.press("KeyG");
    await f.waitFor((p) => p.gathering >= 1, { timeoutMs: 5000 });
    await f.waitFor((p) => p.gathered >= 5, { timeoutMs: 60000, note: "arrival: the first load is hauled home" });
    // pick up a habitat
    await f.press("Digit1");
    await f.waitFor((p) => p.armed === 1 && p.selected === 0, { timeoutMs: 5000 });
    // right click inside the grid: building starts
    await f.clickAt(1000, 600, { button: "right" });
    await f.waitFor((p) => p.building >= 1 || p.structures >= 1, { timeoutMs: 5000 });
    await f.waitFor((p) => p.homes >= 2, { timeoutMs: 30000, note: "arrival: the house is built" });
    await f.waitFor((p) => p.raiding === 1, { timeoutMs: 90000, note: "arrival: the first raid comes" });
    await f.waitFor((p) => p.raids >= 1, { timeoutMs: 90000 });
    await f.expect((p) => p.raids >= 1 && p.people >= 1, "arrival: the raid is beaten off");
  },
});
