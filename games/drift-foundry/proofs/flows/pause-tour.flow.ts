import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/** The held run on native Rune: the pause board, its garage and settings sheet, a real setting change, and back on the road. */
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
    const back = async () => { if (phone) { await f.click("Back"); await settle("Park the run"); } };
    await f.see("New run", { timeoutMs: 90000 }); await settle("Yard calendar");
    // Held at once with P so the compactor cannot end the run first.
    await f.click("New run"); await f.see("LAP 1/1", { timeoutMs: 90000 });
    await f.hold("KeyP", { ms: 150 }); await f.see("Back to the run", { timeoutMs: 90000 }); await shot("pause", "Park the run");
    await f.click("Pit garage"); await f.see("cr banked", { timeoutMs: 90000 }); await shot("pause-garage"); await back();
    await f.click("Settings"); await f.see("Pit settings", { timeoutMs: 90000 }); await settle("Mute all");
    // A real setting change: Mute all flips and reads back on the sheet.
    await f.click("Mute all"); await f.see("On ›", { timeoutMs: 90000 }); await shot("pause-settings");
    await f.click("Mute all"); await f.see("Off ›", { timeoutMs: 90000 }); await back();
    await settle("Back to the run");
    await f.click("Back to the run"); await f.see("AT RISK", { timeoutMs: 90000 }); await shot("resumed", "Pause run");
  },
});
