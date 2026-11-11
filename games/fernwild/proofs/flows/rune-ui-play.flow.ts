import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/**
 * Fernwild's play screens on the native Rune UI: the HUD and its H detail, the inventory with a craft queued by a
 * click, engrams, dossier, a tame's inventory with an order, and the obelisk terminal, each closed again.
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
    await f.wait(1500);
    await f.see("Island", SLOW);
    await snap("hud");
    await f.press("KeyH");
    await f.wait(800);
    await f.see("Stamina", SLOW);
    await snap("hud-detail");
    await f.press("KeyH");
    await f.command("cheat", {
      give: { stone_pick: 1, spear: 1, thatch: 40, wood: 20, stone: 30, flint: 12, fiber: 50, mejoberry: 15, cooked_meat: 3, cloth_shirt: 1, narcotic: 4, storage_box: 1 },
      toHotbar: ["storage_box", "stone_pick", "spear", "mejoberry"],
      xp: 600,
    });
    await f.press("KeyI");
    await f.waitFor((p) => p.screen === 1, { timeoutMs: 60000, note: "I opens the inventory" });
    await f.see("Crafting", SLOW);
    await tap("Craft Stone Pick");
    await f.waitFor((p) => p.crafting >= 1, { timeoutMs: 60000, note: "a click on the recipe queues a Stone Pick" });
    await snap("inventory");
    await tap("Engrams");
    await f.see(/engram points/, SLOW);
    await snap("engrams");
    await tap("Dossier");
    await f.see("Explorer notes", SLOW);
    await snap("dossier");
    await f.press("KeyI");
    await f.waitFor((p) => p.screen === 0, { timeoutMs: 60000, note: "I closes the screens" });
    await f.command("cheat", { summon: { species: "parasaur", level: 5, distance: 4, tamed: true } });
    await f.waitFor((p) => p.aimedWild === 0 && p.aimedHealth > 0, { timeoutMs: 30000, note: "the tame stands under the aim" });
    await f.press("KeyE");
    await f.waitFor((p) => p.screen === 1, { timeoutMs: 60000, note: "the tame's inventory opens" });
    await f.see(/Tamed/, SLOW);
    await snap("creature");
    await tap("Follow (T)");
    await tap("Close");
    await f.waitFor((p) => p.screen === 0, { timeoutMs: 60000, note: "Close shuts the tame's inventory" });
    await f.command("screen", { screen: "obelisk" });
    await f.see(/Green Obelisk/, SLOW);
    await snap("obelisk");
    await tap("Close");
    await f.waitFor((p) => p.screen === 0, { timeoutMs: 60000, note: "Close shuts the obelisk terminal" });
    await f.press("Digit1");
    await f.hold("mouse0", { until: (p) => p.boxes > 0, ms: 80, timeoutMs: 60000 });
    await f.press("KeyE");
    await f.waitFor((p) => p.screen === 1 && p.stored === 0, { timeoutMs: 60000, note: "E opens the placed storage box" });
    await tap("Stone ×");
    await f.waitFor((p) => p.stored > 0, { timeoutMs: 60000, note: "a click on the bag's stone puts it in the box" });
    await snap("storage");
    await tap("Take Stone");
    await f.waitFor((p) => p.stored === 0, { timeoutMs: 60000, note: "Take brings the stone back" });
    await tap("Close");
    await f.waitFor((p) => p.screen === 0, { timeoutMs: 60000, note: "Close shuts the box" });
  },
});
