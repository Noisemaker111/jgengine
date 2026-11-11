import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/** Every screen of the war table on the native Rune surface: HUD, pause, settings, save, title, records, commission, credits. */
export default defineFlow(game, {
  browser: true,
  async run(f) {
    const text = async () => String(await f.page("window.__jgNativeUi?.text() ?? ''"));
    const until = async (want: string, ms: number) => {
      for (let waited = 0; waited <= ms; waited += 500) { if ((await text()).includes(want)) return true; await f.wait(500); }
      return false;
    };
    // A real pointer arrives over the control, then presses. If the press never lands, the tour says so
    // (`degraded:`) and presses the same control through the native bridge, so the screens after it are still seen.
    const tap = async (label: string, arrive: string) => {
      let at: { x: number; y: number } | null = null;
      for (let waited = 0; at === null && waited <= 15000; waited += 500) {
        at = await f.page(`window.__jgNativeUi?.point(${JSON.stringify(label)}) ?? null`) as { x: number; y: number } | null;
        if (at === null) await f.wait(500);
      }
      if (at !== null) {
        await f.moveMouse(at.x, at.y);
        // Arriving focuses the control and resubmits the tree; a hand rests a moment before it presses.
        await f.wait(1500);
        await f.clickAt(at.x, at.y);
        if (await until(arrive, 15000)) { console.log(`pointer: "${label}" landed`); return; }
      }
      console.log(`degraded: a real pointer press on "${label}" ${at === null ? "had no painted rect" : "did not land"}; pressed through the native bridge`);
      await f.page(`window.__jgNativeUi.press(${JSON.stringify(label)})`);
      await f.see(arrive, { timeoutMs: 60000 });
    };
    // A software-GPU host paints Rune frames seconds behind the state; let the frame catch up before each shot.
    const snap = async (name: string) => { await f.wait(2000); await f.shot(name); };
    await f.waitForPage("(window.__jgNativeUi?.stats().frames ?? 0) > 0", { timeoutMs: 60000, note: "native Rune submitted a frame" });
    await f.waitForPage("window.__jgNativeUi?.point('Pause battle') != null", { timeoutMs: 60000, note: "the live battle offers its pause seal" });
    await f.see("Bram the Bold");
    await f.wait(1500);
    await snap("hud");
    await tap("Build Farm", "place the Farm");
    await tap("Pause battle", "Orders on hold");
    await tap("Settings", "Field preferences");
    await tap("Credits", "game-icons.net");
    await tap("Save", "Orders written");
    await f.see("Orders written", { timeoutMs: 60000, note: "the record is written" });
    await tap("Return to title", "Take command");
    await tap("Campaign records", "Campaign III");
    await tap("New campaign", "Seal the commission");
    await tap("Commander", "Type the name");
    for (const key of ["KeyB", "KeyR", "KeyA", "KeyM"] as const) await f.press(key);
    await f.press("Escape");
    await f.see("Bram");
    await tap("Settings", "Larger HUD text");
    await tap("Larger HUD text", "✓");
    await f.wait(800);
    await f.page("window.__jgNativeUi.press('Larger HUD text')");
    await tap("Credits", "game-icons.net");
    await tap("Free skirmish", "Raze the Marauder Warcamp");
    await f.waitForPage("window.__jgNativeUi?.point('Pause battle') != null", { timeoutMs: 30000, note: "the skirmish battle offers its pause seal" });
    await f.wait(1500);
  },
});
