import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";
import openPark from "./to-open-park.flow";
import { lotScreen } from "./lotScreen";

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
    await f.waitForPage("/“.+”/.test(window.__jg?.nativeUi.text())", { timeoutMs: 60000, note: "arrival: the status card lists what the crowd is saying, from the live guests' thoughts" });
    await f.timeScale(1);
    await f.expectPage("window.__jg?.agent.handle({ method: 'run_command', name: 'park.pointer', input: { point: [0, 0, 0], entity: window.__jg?.brightway.read().thinkingGuests[0], object: null } }).status", "pick a live guest the way a click on one does: the pointer command with that guest as the hit entity", "applied");
    await f.waitForPage("(function has(n) { return (n.props?.label === 'Guest thoughts' && n.children.length > 0) || n.children.some(has); })(window.__jg?.nativeUi.tree())", { timeoutMs: 10000, note: "arrival: the guest window shows that guest's own thoughts" });
    await f.shot("brightway-guest-thoughts");
  },
});
