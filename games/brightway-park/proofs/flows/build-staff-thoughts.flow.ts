import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.see(/gates open/i, { timeoutMs: 30000, note: "arrival: the park day is running and the gate is open" });
    // the palette's carousel hotkey
    await f.press("Digit1");
    // an empty plot right of the main path, clear of the palette
    await f.clickAt(1120, 420);
    await f.see("8 rides · 3/8", { timeoutMs: 5000, note: "arrival: the starter park's two rides plus the placed carousel" });
    // click the new carousel to inspect it
    await f.clickAt(1120, 400);
    await f.waitForPage("document.querySelector('.bw-side')?.innerText.includes('Connect it') === true", { timeoutMs: 5000 });
    await f.expectPage("document.querySelector('.bw-side')?.innerText.includes('Needs an entrance') === true", "arrival: a new ride is shut until it has an entrance, an exit and a path, and says so");
    await f.click("Connect it");
    await f.see("Connected", { timeoutMs: 5000, note: "arrival: Connect it laid the entrance, exit and paths, so the ride opens" });
    await f.shot("brightway-connected");
    await f.click("Staff");
    await f.click("Handyman");
    // grass right of the carousel, inside the fence
    await f.clickAt(1300, 470);
    await f.see("Handyman built", { timeoutMs: 5000, note: "arrival: a handyman is hired, the park's own notice confirming it" });
    await f.waitForPage("document.querySelectorAll('.bw-said li').length > 0", { timeoutMs: 30000, note: "arrival: the status card lists what the crowd is saying, from the live guests' thoughts" });
    await f.expectPage("window.__jgengineAgent.handle({ method: 'run_command', name: 'park.pointer', input: { point: [0, 0, 0], entity: window.__brightway.read().thinkingGuests[0], object: null } }).status", "pick a live guest the way a click on one does: the pointer command with that guest as the hit entity", "applied");
    await f.waitForPage("document.querySelector('.bw-thoughts li') !== null", { timeoutMs: 10000, note: "arrival: the guest window shows that guest's own thoughts" });
    await f.shot("brightway-guest-thoughts");
  },
});
