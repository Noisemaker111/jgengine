import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/**
 * From a new house with no save: open the Rooms plan, pick the empty room 4 and give Pip-9 its door
 * through the room card's own button, then separate Krrt from Glorp's swamp gas by moving Sister Fog
 * between them. Every press goes through the native UI's press path; each step is checked on the
 * probe, never assumed.
 */
export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitFor((p) => p.members === 4 && p.rooms === 4, { timeoutMs: 60000 });
    await f.expect((p) => p.housed === 3 && p.pipRoom === -1 && p.comfy === 3, "arrival: opening night, Pip-9 in the cupboard, three comfortable");
    const text = "(window.__jgNativeUi?.text() ?? '')";
    const press = async (label: string) => { await f.page(`window.__jgNativeUi.press(${JSON.stringify(label)})`); };
    await press("Rooms");
    await f.waitForPage(`${text}.includes("Rooms plan")`, { timeoutMs: 20000, note: "the Rooms plan opens from the tool tray" });
    await press("Room 4 · empty");
    await f.waitForPage(`${text}.includes("Room 4 · empty")`, { timeoutMs: 20000, note: "room 4's card is open" });
    await press("Pip-9 (cupboard)");
    await f.waitFor((p) => p.pipRoom === 3 && p.housed === 4, { timeoutMs: 20000, note: "arrival: Pip-9 moved into room 4 through the card's button" });
    await f.waitFor((p) => p.comfy === 4, { timeoutMs: 20000, note: "arrival: the lease's first goal reads four comfortable" });
    await press("Room 2 · Glorp");
    await f.waitForPage(`${text}.includes("Room 2 · Glorp")`, { timeoutMs: 20000, note: "Glorp's card is open" });
    await press("Sister Fog (room 3)");
    await f.waitForPage(`${text}.includes("Room 2 · Sister Fog")`, { timeoutMs: 20000, note: "arrival: Sister Fog swapped into room 2, between Krrt and Glorp" });
  },
});
