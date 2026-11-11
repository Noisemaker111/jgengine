import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/**
 * Fernwild's title on the native Rune UI with real clicks: Controls, Settings (a tab change), Credits, Back from
 * each, then New game into the creator, a name and body choice, and Wake up into a run. Shots carry
 * `-desktop` or `-phone` from the viewport width.
 */
/** Software Rune on a busy host draws a frame every few seconds. */
const SLOW = { timeoutMs: 90000 };

export default defineFlow(game, {
  browser: true,
  state: "title",
  async run(f) {
    const width = Number(await f.page("window.innerWidth"));
    // Software Rune can take seconds per frame: wait until the control has a drawn rect, then click it.
    const tap = async (label: string) => {
      await f.waitForPage(`window.__jgNativeUi?.point(${JSON.stringify(label)}) != null`, { timeoutMs: 90000, note: `"${label}" is drawn` });
      await f.click(label);
    };
    // Each shot follows a change: wait for a native frame drawn since the last shot, then for frames to stop.
    const frames = async () => Number(await f.page("window.__jgNativeUi?.stats().frames ?? 0"));
    let shotAt = 0;
    const snap = async (name: string) => {
      for (let polls = 0; polls < 20 && (await frames()) <= shotAt; polls += 1) await f.wait(3000);
      await f.wait(6000);
      for (let last = -1, now = await frames(); now !== last; last = now, now = await frames()) await f.wait(4000);
      // A pointer move over the native canvas wakes one more frame, so the capture shows the settled page.
      for (const x of [3, 4]) {
        await f.page(`document.getElementById("jg-ui")?.dispatchEvent(new PointerEvent("pointermove", { clientX: ${x}, clientY: ${x}, bubbles: true })) ?? false`);
        await f.wait(2500);
      }
      await f.shot(at(name));
      shotAt = await frames();
    };
    const at = (name: string) => `rune-${name}-${width < 600 ? "phone" : "desktop"}`;
    await f.waitForPage("(window.__jgNativeUi?.stats().frames ?? 0) > 0", { note: "native Rune submitted a frame" });
    await f.see("FERNWILD", SLOW);
    await snap("title");
    await tap("Controls");
    await f.see(/Whistle your tames/, SLOW);
    await f.expect((p) => p.menuPane === 1, "the Controls page is the menu's pane");
    await snap("controls");
    await tap("Back");
    await tap("Settings");
    await f.see("Master volume", SLOW);
    await tap("Graphics");
    await f.wait(500);
    await snap("settings");
    await tap("Back");
    await tap("Credits");
    await f.see(/made with JGengine/, SLOW);
    await snap("credits");
    await tap("Back");
    await tap("New game");
    await f.see("Choose where you wake", SLOW);
    await tap("Next name");
    await tap("Woman 1");
    await f.see("Ada", SLOW);
    await snap("creator");
    await tap("Wake up");
    await f.waitFor((p) => p.phase === 1 && p.health > 0 && p.creatures > 0, { timeoutMs: 60000, note: "the run starts from the creator" });
  },
});
