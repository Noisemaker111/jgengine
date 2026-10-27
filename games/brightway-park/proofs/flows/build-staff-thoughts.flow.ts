import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";
import openPark from "./to-open-park.flow";
import { lotScreen } from "./lotScreen";

/**
 * From the empty lot to a park with a crowd: the open-park proof, then a handyman hired by clicking
 * the Staff palette and the grass, and the guests' own thoughts read off the status card and a
 * clicked guest's window.
 */
export default defineFlow(game, {
  browser: true,
  async run(f) {
    await openPark.run(f);
    await f.press("KeyL");
    await f.click("Staff");
    await f.click("Handyman");
    const grass = await lotScreen(f, -12, 36);
    await f.clickAt(grass.x, grass.y);
    await f.see("Handyman built", { timeoutMs: 5000, note: "arrival: a handyman is hired, the park's own notice confirming it" });
    await f.timeScale(4);
    await f.waitForPage("document.querySelectorAll('.bw-said li').length > 0", { timeoutMs: 60000, note: "arrival: the status card lists what the crowd is saying, from the live guests' thoughts" });
    await f.timeScale(1);
    await f.expectPage("window.__jgengineAgent.handle({ method: 'run_command', name: 'park.pointer', input: { point: [0, 0, 0], entity: window.__brightway.read().thinkingGuests[0], object: null } }).status", "pick a live guest the way a click on one does: the pointer command with that guest as the hit entity", "applied");
    await f.waitForPage("document.querySelector('.bw-thoughts li') !== null", { timeoutMs: 10000, note: "arrival: the guest window shows that guest's own thoughts" });
    await f.shot("brightway-guest-thoughts");
  },
});
