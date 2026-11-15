import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/** Every Drift Foundry screen on native Rune: the pit's panes, the race HUD, the pause board, a setting change and the result card. */
export default defineFlow(game, {
  browser: true,
  state: "title",
  async run(f) {
    const phone = await f.page("innerWidth < 700") === true;
    // A software-drawn native frame can trail the tree by seconds: a shot waits until the screen's
    // own control has a laid-out rect (the hit test reads the same rects), or a fresh frame lands.
    const settle = async (control?: string) => {
      if (control !== undefined) { await f.waitForPage(`window.__jgNativeUi?.point(${JSON.stringify(control)}) != null`, { timeoutMs: 120000, note: `${control} is laid out` }); await f.wait(3000); return; }
      const before = Number(await f.page("window.__jgNativeUi?.stats().frames ?? 0"));
      try { await f.waitForPage(`(window.__jgNativeUi?.stats().frames ?? 0) > ${before}`, { timeoutMs: 20000 }); } catch { /* a settled page draws no frames */ }
      await f.wait(1500);
    };
    const shot = async (name: string, control?: string) => { await settle(control); await f.shot(name); };
    // A phone opens each pane over the plates; its Back stamp returns to them.
    const back = async () => { if (phone) { await f.click("Back"); await settle("Weekly circular"); } };
    await f.waitForPage("(window.__jgNativeUi?.stats().frames ?? 0) > 0", { timeoutMs: 40000, note: "native Rune submitted a frame" });
    await f.see("New run", { timeoutMs: 40000 });
    await shot("title", "New run");
    await f.click("Weekly circular"); await f.see("medal points", { timeoutMs: 90000 }); await shot("calendar", "Race Price Check"); await back();
    await f.click("Customer service"); await f.see("store credit", { timeoutMs: 90000 }); await shot("garage"); await back();
    await f.click("Store records"); await f.see("BEST CHECKOUT", { timeoutMs: 90000 }); await shot("records"); await back();
    await f.click("Settings"); await f.see("Picture · sound · controls", { timeoutMs: 90000 }); await shot("settings", "Mute all"); await back();
    await f.click("Credits"); await f.see("Original Cleanup on Aisle 9 art", { timeoutMs: 90000 }); await shot("credits"); await back();
    await f.click("New run"); await f.see("LAP 1/1", { timeoutMs: 90000 });
    await shot("hud", "Pause run");
    // Idling on the line, the compactor catches the buggy: the result card comes up.
    await f.see("SHOP AGAIN", { timeoutMs: 300000 });
    await shot("result", "Back to pit");
    await f.click("Back to customer service"); await f.see("New run", { timeoutMs: 90000 }); await settle("Weekly circular");
  },
});
