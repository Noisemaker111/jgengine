import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/**
 * Fernwild's death, pause and save on the native Rune UI: a death leaves the body line, Esc pauses, Save writes,
 * Quit to title keeps the run, and Continue on the title loads it back into play.
 */
/** Software Rune on a busy host draws a frame every few seconds. */
const SLOW = { timeoutMs: 90000 };

export default defineFlow(game, {
  browser: true,
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
    await f.waitFor((p) => p.phase === 1 && p.health > 0 && p.creatures > 0, { timeoutMs: 90000, note: "the run is playing" });
    await f.waitForPage("(window.__jgNativeUi?.stats().frames ?? 0) > 0", { note: "native Rune submitted a frame" });
    await f.command("cheat", { give: { stone: 3 }, kill: true, destroyWild: true });
    await f.wait(3000);
    await f.see(/Your body/, SLOW);
    await snap("death");
    await f.press("Escape");
    await f.waitFor((p) => p.phase === 2, { timeoutMs: 60000, note: "Esc pauses" });
    await f.see(/QUIT TO TITLE/, SLOW);
    await snap("paused");
    await tap("Save");
    await f.see("Saved", SLOW);
    await tap("Quit to title");
    await f.waitFor((p) => p.phase === 0, { timeoutMs: 60000, note: "quit saves and returns to the title" });
    await f.see("Back where you left off", SLOW);
    await snap("title-saved");
    await tap("Continue");
    await f.waitFor((p) => p.phase === 1, { timeoutMs: 60000, note: "Continue loads the save into play" });
    await f.wait(1500);
    await snap("continued");

  },
});
