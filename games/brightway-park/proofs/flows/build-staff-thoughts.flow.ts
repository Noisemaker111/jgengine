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
    await f.click("Spooks");
    await f.click("Ghoul Groundskeeper");
    const grass = await lotScreen(f, -12, 36);
    await f.clickAt(grass.x, grass.y);
    await f.see("Ghoul Groundskeeper built", { timeoutMs: 5000, note: "arrival: a ghoul is raised, the haunt's own notice confirming it" });
    await f.timeScale(4);
    await f.waitForPage("/“.+”/.test(window.__jgNativeUi.text())", { timeoutMs: 60000, note: "arrival: the status card lists what the crowd is saying, from the live guests' thoughts" });
    await f.timeScale(1);
    await f.expectPage("window.__jgengineAgent.handle({ method: 'run_command', name: 'park.pointer', input: { point: [0, 0, 0], entity: window.__brightway.read().thinkingGuests[0], object: null } }).status", "pick a live guest the way a click on one does: the pointer command with that guest as the hit entity", "applied");
    await f.waitForPage("(function has(n) { return (n.props?.label === 'Visitor thoughts' && n.children.length > 0) || n.children.some(has); })(window.__jgNativeUi.tree())", { timeoutMs: 10000, note: "arrival: the guest window shows that guest's own thoughts" });
    await f.shot("hauntworks-visitor-thoughts");
  },
});
