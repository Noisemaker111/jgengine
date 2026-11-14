import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/**
 * The landlord's first look: a fresh house is live, the Rooms plan opens from the tool tray, the
 * blueprint shows the leak between Krrt and Glorp, and Glorp's room card names the complaint. Each
 * press goes through the native tree's own press path and is checked by what the tree then shows.
 */
export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitFor((p) => p.members === 4 && p.rooms === 4, { timeoutMs: 60000 });
    await f.expect((p) => p.housed === 3 && p.reputation === 50, "arrival: opening night — three of four rooms let, reputation 50");
    const text = "(window.__jgNativeUi?.text() ?? '')";
    const press = async (label: string, arrive: string) => {
      await f.page(`window.__jgNativeUi.press(${JSON.stringify(label)})`);
      await f.waitForPage(`${text}.includes(${JSON.stringify(arrive)})`, { timeoutMs: 20000, note: `pressing "${label}" shows "${arrive}"` });
    };
    await press("Rooms", "Rooms plan");
    await f.shot("rooms-plan");
    await press("Room 2 · Glorp", "Room 2 · Glorp");
    await f.expectPage(`${text}.includes("seeping in")`, "arrival: Glorp's card names the air leaking through the shared wall");
    await f.shot("room-glorp");
  },
});
