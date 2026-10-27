import { defineFlow } from "@jgengine/core/play/flow";

export default defineFlow(null, {
  browser: true,
  async run(f) {
    // a fresh world on a signed-in account (local Convex: bun --cwd=llmville run convex:dev) opens on tutorial step 1
    await f.see("Give your GPUs a home", { timeoutMs: 30000 });
    await f.click("Shop for a rack");
    await f.click("Buy ×1");
    await f.expectPage("document.body.innerText.includes('Place your rack')", "arrival: the $200 rack left the wallet and the tutorial asks for its spot");
    await f.click("Place your rack");
    await f.wait(1500);
    await f.press("KeyE");
    // the placed rack founded the plot on the server
    await f.see("Power up your lab", { timeoutMs: 15000 });
    await f.click("Shop for GPUs");
    await f.click("Buy ×1");
    await f.wait(1500);
    await f.click("Buy ×1");
    await f.expectPage("document.body.innerText.includes('Put your GPUs to work')", "arrival: two GPUs bought, tutorial step 4 of 9 (install, license, collect, train, serve follow)");
  },
});
