import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/**
 * The native Rune play UI: open a day from the time card, the HUD, hire and inspect a worker, buy
 * their gear, open the street, the town hall's buttons, pause, save, clock out, return to the kept
 * street, and the end-of-day board with its season map and union hall. Run at desktop and phone
 * sizes; each shot carries the viewport width in its name.
 */
export default defineFlow(game, {
  browser: true,
  state: "title",
  async run(f) {
    const width = await f.page("innerWidth");
    const size = typeof width === "number" && width < 600 ? "phone" : "desktop";
    const shot = (name: string) => f.shot(`${name}-${size}`);
    const settle = () => f.wait(5000);
    await f.waitForPage("(window.__jgNativeUi?.stats().frames ?? 0) > 0", { timeoutMs: 60000, note: "native Rune submitted a frame" });
    await f.see(/new day/i, { timeoutMs: 40000 });
    await settle();
    await f.click("New Day");
    await f.see(/time card/i);
    await settle();
    await f.click("Open Maple Street");
    await f.see(/open for business/i, { timeoutMs: 30000 });
    await settle();
    await shot("hud");

    // A tile on the hiring board, then a plot on the street.
    await f.click("Barista, 50 cash");
    await f.waitFor((p) => p.selected === 1, { timeoutMs: 20000, note: "the tile picks the barista for hire" });
    await f.command("tower.build", { point: [0, 0, 4] });
    await f.waitFor((p) => p.towers >= 1, { timeoutMs: 20000, note: "the barista clocks in on the bend" });
    await f.command("tower.build", { point: [0, 0, 4] });
    await f.see(/aim:/i, { timeoutMs: 20000, note: "clicking her plot opens the worker card" });
    await settle();
    await f.click("Aim");
    await f.see(/aim: last/i, { note: "the aim plank cycles the worker's target choice" });
    await f.see(/espresso shot/i, { note: "the card offers her gear" });
    await settle();
    await shot("worker");

    await f.click("Open for business");
    await f.see(/\d+ gadgets? left/i, { timeoutMs: 20000 });
    await f.see(/town hall/i, { note: "the town hall's buttons stand at the corner" });
    await settle();
    await shot("wave");

    await f.press("Escape");
    await f.see(/do not disturb/i, { timeoutMs: 10000, note: "Escape opens the door hanger" });
    await settle();
    await shot("pause");
    await f.click("Save Maple Street");
    await f.see(/kept on maple street/i, { timeoutMs: 90000, note: "the door hanger writes the street (its thumbnail render is slow on software GL)" });
    await f.click("Back to work");
    await f.see(/gadgets? left|street clear|tech incoming/i, { timeoutMs: 10000 });
    await f.click("Pause the day");
    await f.see(/clock out/i, { timeoutMs: 20000, note: "the HUD's pause button opens the door hanger too" });
    await f.click("Clock out to title");
    await f.see(/continue/i, { timeoutMs: 90000, note: "clocking out saves the street (a slow thumbnail on software GL) and returns to the title" });
    await f.click("Streets");
    await f.see(/wave \d/i, { timeoutMs: 10000 });
    await settle();
    await shot("streets-saved");
    await f.click("Return to Maple Street");
    await f.waitFor((p) => p.towers >= 1, { timeoutMs: 30000, note: "the kept street stands its barista again" });

    await f.command("run.stage", { mode: "result" });
    await f.see(/union hall/i, { timeoutMs: 90000, note: "the day played to its end raises the end-of-day board" });
    await f.see(/the season/i, { note: "the board carries the season map" });
    await settle();
    await shot("end-of-day");
    await f.click("Clock in again");
    await f.see(/open for business/i, { timeoutMs: 20000, note: "Clock in again opens a fresh day" });
  },
});
