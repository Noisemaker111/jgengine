import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

const PIECES = [
  ["cloth_hat", "head"],
  ["cloth_shirt", "torso"],
  ["cloth_pants", "legs"],
  ["cloth_gloves", "hands"],
  ["cloth_boots", "feet"],
] as const;
const ITEMS = PIECES.map(([item]) => item);
const SLOTS = PIECES.map(([, slot]) => slot);

/** Cloth on the survivor's body: each piece put on in turn, in the inventory pane, taken off, then worn walking and in first person. */
export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitFor((p) => p.creatures > 0, { timeoutMs: 60000 });
    await f.command("cheat", { give: Object.fromEntries(ITEMS.map((item) => [item, 1])) });
    await f.command("cheat", { turn: Math.PI });
    await f.wait(800);
    await f.shot("clothing-none");
    for (const [item, slot] of PIECES) {
      await f.command("cheat", { wear: [item] });
      await f.wait(700);
      await f.shot(`clothing-${slot}`);
    }
    await f.press("KeyI");
    await f.wait(1500);
    await f.shot("clothing-pane");
    await f.press("KeyI");
    await f.command("cheat", { takeOff: SLOTS });
    await f.wait(700);
    await f.shot("clothing-off");
    await f.command("cheat", { wear: ITEMS });
    await f.command("cheat", { turn: Math.PI });
    await f.hold("KeyD", { ms: 700 });
    await f.shot("clothing-walking");
    await f.press("KeyV");
    await f.wait(800);
    await f.shot("clothing-first-person");
  },
});
