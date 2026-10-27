import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";
import openPark from "./to-open-park.flow";
import { lotScreen } from "./lotScreen";

/**
 * The first breakdown, from the empty lot: the open-park proof, then the carousel runs until it
 * wears out and breaks on its own. It stays down, the hint says to hire a mechanic and rings Staff,
 * the player hires one by clicking, and the mechanic goes straight to the ride and fixes it.
 */
export default defineFlow(game, {
  browser: true,
  async run(f) {
    await openPark.run(f);
    // Close the books, then take the hint's lab step: the Ice Cream Cart from the Lab panel.
    await f.press("KeyL");
    await f.click("Lab");
    await f.click("Ice Cream Cart");
    await f.click("Lab");
    await f.waitForPage("document.querySelector('[data-onboarding-step]')?.getAttribute('data-onboarding-step') === 'mechanic'", { timeoutMs: 3000, note: "hint: with research running, the next step is a mechanic" });
    await f.timeScale(8);
    await f.waitFor((p) => p.breakdowns > 0, { timeoutMs: 120000, note: "breakdown: the carousel wears out and breaks on its own" });
    await f.timeScale(1);
    await f.see(/hire a mechanic/i, { timeoutMs: 5000, note: "breakdown: the park says the ride needs a mechanic" });
    await f.waitForPage("document.querySelector('[data-onboarding-step]')?.getAttribute('data-onboarding-step') === 'mechanic'", { timeoutMs: 3000, note: "hint: the next step is hiring a mechanic" });
    await f.expectPage("document.querySelector('[data-bw-pointed]')?.matches('[data-build-category=staff], [data-build-item=staff_mechanic], [data-hint=build]') === true", "hint: the hint rings the way to the Staff palette");
    await f.shot("brightway-first-breakdown");
    // With no mechanic, nothing fixes it: still down after a while.
    await f.timeScale(4);
    await f.wait(5000);
    await f.timeScale(1);
    await f.expect((p) => p.breakdowns > 0, "breakdown: the ride is still waiting");
    await f.expectPage("document.body.innerText.includes('ride down') || document.body.innerText.includes('rides down')", "breakdown: the status card counts the ride as down");

    await f.click("Staff");
    await f.click("Mechanic");
    const grass = await lotScreen(f, -12, 36);
    await f.clickAt(grass.x, grass.y);
    await f.see("Mechanic built", { timeoutMs: 5000, note: "fix: a mechanic is hired by clicking the palette and the lot" });
    await f.waitForPage("document.querySelector('[data-onboarding-step]') === null", { timeoutMs: 3000, note: "hint: the mechanic step is done" });
    await f.timeScale(4);
    await f.see(/running again/i, { timeoutMs: 60000, note: "fix: the new mechanic goes straight to the broken ride and it runs again" });
    await f.timeScale(1);
    await f.expectPage("!document.body.innerText.includes('ride down')", "fix: no ride is down any more");
    await f.shot("brightway-mechanic-fixed");
  },
});
