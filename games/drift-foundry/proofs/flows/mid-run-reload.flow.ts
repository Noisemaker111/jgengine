import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

export default defineFlow(game, {
  state: "title",
  browser: true,
  async run(f) {
    // the pit menu is up
    await f.see("New run", { timeoutMs: 40000 });
    // New run
    await f.hold("Enter", { ms: 200 });
    // the aisle HUD is live, basket empty
    await f.see("BASKET 0/", { timeoutMs: 20000 });
    // push down the aisle, steering where the shopping tip points, until something is in the basket
    for (let step = 0; step < 300; step += 1) {
      const r = await f.probe();
      if (r.phase !== 1 || (r.items > 0 && r.run > 15)) break;
      if (r.jumpNow === 1) await f.press("Space");
      else {
        const want = r.tip === 1 ? r.tipSide * 0.5 : r.tip === 3 && r.tipSide !== 0 ? r.tipSide * 0.3 : Math.max(-0.35, Math.min(0.35, -r.x * 0.08));
        const turn = want - r.heading;
        await f.hold(Math.abs(turn) < 0.08 ? "KeyW" : ["KeyW", turn > 0 ? "KeyA" : "KeyD"], { ms: 150 });
      }
    }
    const before = await f.expect((p) => p.phase === 1 && p.items > 0 && p.value > 0, "shopping in the basket mid-run");
    await f.expectPage("sessionStorage.setItem('basket', (window.__jgNativeUi?.text() ?? document.body.innerText).match(/BASKET (\\d+)\\//)?.[1] ?? '0') ?? Number(sessionStorage.getItem('basket')) > 0", "the HUD's basket count, recorded before the reload, is nonzero");
    // pausing parks the cart at customer service; then the page goes away
    await f.hold("KeyP", { ms: 150 });
    await f.see("Back to the run", { timeoutMs: 40000 });
    await f.waitFor((p) => p.parked === 1, { timeoutMs: 10000 });
    await f.reload();
    // the pit offers the run the game kept, basket and all
    await f.see(`${before.items} items`, { timeoutMs: 40000 });
    // Continue run
    await f.hold("Enter", { ms: 200 });
    await f.waitFor((p) => p.phase === 1, { timeoutMs: 20000 });
    await f.expect((p) => p.items === before.items && p.value === before.value && p.powerUps === before.powerUps, "the basket after the reload is the basket before it");
    await f.expectPage("(window.__jgNativeUi?.text() ?? document.body.innerText).match(/BASKET (\\d+)\\//)?.[1] === sessionStorage.getItem('basket')", "and the HUD shows the same count");
    await f.expect((p) => Math.abs(p.run - before.run) < 2, "and the cart came back where it stood, not at the start line");
  },
});
