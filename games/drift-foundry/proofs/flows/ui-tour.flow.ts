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
    const back = async () => { if (phone) { await f.click("Back"); await settle("Yard calendar"); } };
    await f.waitForPage("(window.__jgNativeUi?.stats().frames ?? 0) > 0", { timeoutMs: 40000, note: "native Rune submitted a frame" });
    await f.see("New run", { timeoutMs: 40000 });
    await shot("title", "New run");
    await f.click("Yard calendar"); await f.see("medal points", { timeoutMs: 90000 }); await shot("calendar", "Race Time Sheet"); await back();
    await f.click("Pit garage"); await f.see("cr banked", { timeoutMs: 90000 }); await shot("garage"); await back();
    await f.click("Corridor records"); await f.see("BEST ESCAPE", { timeoutMs: 90000 }); await shot("records"); await back();
    await f.click("Settings"); await f.see("Pit settings", { timeoutMs: 90000 }); await shot("settings", "Mute all"); await back();
    await f.click("Credits"); await f.see("Original Drift Foundry art", { timeoutMs: 90000 }); await shot("credits"); await back();
    await f.click("New run"); await f.see("LAP 1/1", { timeoutMs: 90000 });
    await shot("hud", "Pause run");
    // Idling on the line, the compactor catches the buggy: the result card comes up.
    await f.see("RUN IT AGAIN", { timeoutMs: 300000 });
    await shot("result", "Back to pit");
    await f.click("Back to pit"); await f.see("New run", { timeoutMs: 90000 }); await settle("Yard calendar");
  },
});
