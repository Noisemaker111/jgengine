import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/**
 * The native Rune play UI: raise a defense, the HUD, build and inspect a tower, release a wave,
 * pause, save, withdraw, load the kept defense back, and the memorial. Run at desktop and phone sizes; each shot carries the viewport width in its name.
 */
export default defineFlow(game, {
  browser: true,
  state: "title",
  async run(f) {
    const width = await f.page("innerWidth");
    const size = typeof width === "number" && width < 600 ? "phone" : "desktop";
    const shot = (name: string) => f.shot(`${name}-${size}`);
    // Software Rune on a loaded host can take seconds to present a changed screen: let it land before a press or a shot.
    const settle = () => f.wait(7000);
    await f.waitForPage("(window.__jgNativeUi?.stats().frames ?? 0) > 0", { timeoutMs: 60000, note: "native Rune submitted a frame" });
    await f.see(/new defense/i, { timeoutMs: 40000 });
    await settle();
    await f.click("New Defense");
    await f.see(/commission/i);
    await settle();
    await f.click("Raise The Keep");
    await f.see(/begin first assault/i, { timeoutMs: 20000 });
    await settle();
    await shot("hud");

    // A plaque, then a ring on the field: the native rack hands the click through to the world.
    await f.click("Archer Post");
    await f.see(/click a foundation ring/i);
    if (size === "desktop") await f.clickAt(632, 326);
    else await f.command("tower.build", { point: [-12, 0, -3.2] });
    await f.waitFor((p) => p.towers >= 1, { timeoutMs: 20000, note: "the archer post rises on its ring" });
    // The hand stays on the archer: a second post on a known plot. Pressing the plaque again puts the
    // hand down, so the next click on that plot opens its tablet.
    await f.command("tower.build", { point: [0, 0, 4] });
    await f.waitFor((p) => p.towers >= 2, { timeoutMs: 20000, note: "the second post rises" });
    await settle();
    await f.click("Archer Post");
    await f.see(/pick a tower to build|raising/i);
    await f.wait(6000);
    await f.command("tower.build", { point: [0, 0, 4] });
    await f.see(/aim:/i, { timeoutMs: 20000, note: "the mason's tablet shows the inspected tower" });
    await f.click("Aim");
    await f.see(/aim: last/i, { note: "the aim plank cycles the tower's target choice" });
    await settle();
    await shot("tower");

    await f.click("Begin first assault");
    await f.see(/\d+ raiders? left/i, { timeoutMs: 20000 });
    await settle();
    await shot("wave");

    await f.press("Escape");
    await f.see(/hold the line/i, { timeoutMs: 10000, note: "Escape opens the war banner" });
    await settle();
    await shot("pause");
    await f.click("Save The Keep");
    await f.see(/kept in the keep/i, { timeoutMs: 20000, note: "the pause banner writes the keep" });
    await f.click("Settings");
    await f.see(/prepare the keep/i);
    await settle();
    await f.click("Back");
    await f.see(/hold the line/i);
    await settle();
    await f.click("Hold the line");
    await f.see(/raiders? left|field clear|raiders incoming/i, { timeoutMs: 10000 });
    await f.click("Pause the defense");
    await f.see(/withdraw/i, { timeoutMs: 10000, note: "the HUD's pause sigil opens the banner too" });
    await f.click("Withdraw");
    await f.see(/continue/i, { timeoutMs: 30000 });
    await f.click("Keeps");
    await f.see(/hold the keep|wave \d/i, { timeoutMs: 10000 });
    await settle();
    await shot("keeps-saved");
    await f.click("Hold The Keep");
    await f.waitFor((p) => p.towers >= 1, { timeoutMs: 30000, note: "the loaded keep stands its archer post again" });
    await f.see(/raiders? left|field clear|raiders incoming|send wave/i, { timeoutMs: 20000 });

    await f.command("run.stage", { mode: "result" });
    await f.see(/war council/i, { timeoutMs: 60000, note: "the defense played to its end raises the memorial" });
    await settle();
    await shot("memorial");
    await f.click("Defend again");
    await f.see(/begin first assault/i, { timeoutMs: 20000, note: "Defend again opens a fresh defense" });
  },
});
