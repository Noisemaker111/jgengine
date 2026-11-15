import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/**
 * The native Rune front end: the diner-sign title, Streets, the Overtime Board, Settings, Credits and
 * the New Day time card. Run at desktop and phone sizes; each shot carries the viewport width in its name.
 */
export default defineFlow(game, {
  browser: true,
  state: "title",
  async run(f) {
    const width = await f.page("innerWidth");
    const size = typeof width === "number" && width < 600 ? "phone" : "desktop";
    const shot = (name: string) => f.shot(`${name}-${size}`);
    // Software Rune on a loaded host can take seconds to present a changed screen: let it land before a press or a shot.
    const settle = () => f.wait(5000);
    const backToTitle = async () => {
      await f.click("Back");
      await f.waitForPage("window.__jgNativeUi?.point('Credits') != null && window.__jgNativeUi?.point('Back') == null", { timeoutMs: 20000, note: "Back returns to the title" });
      await settle();
    };
    await f.waitForPage("(window.__jgNativeUi?.stats().frames ?? 0) > 0", { timeoutMs: 60000, note: "native Rune submitted a frame" });
    await f.see(/new day/i, { timeoutMs: 40000 });
    await settle();
    await shot("title");

    await f.click("Streets");
    await f.see(/closed for business/i);
    await settle();
    await shot("streets-empty");
    await backToTitle();

    await f.click("Overtime Board");
    await f.see(/no night worked yet/i);
    await settle();
    await shot("overtime-board");
    await backToTitle();

    await f.click("Settings");
    await f.see(/settings/i);
    await settle();
    await shot("settings");
    await backToTitle();

    await f.click("Credits");
    await f.see(/jgengine/i);
    await settle();
    await shot("credits");
    await backToTitle();

    await f.click("New Day");
    await f.see(/time card/i);
    await settle();
    // The shift manager signs by keyboard: real key presses into the native field, sealed with Enter.
    await f.click("Shift manager name");
    await f.see(/type your name/i, { note: "the name field opens for typing" });
    for (const key of ["KeyA", "KeyD", "KeyA", "Space", "KeyR", "KeyO", "KeyO", "KeyK"] as const) await f.press(key);
    await f.press("Enter");
    await f.see(/ada rook/i, { timeoutMs: 20000, note: "the typed name is signed on the time card" });
    await f.click("Next name");
    await f.click("Double Shift");
    await f.see(/fourth star/i, { note: "the shift's detail line follows the pick" });
    await f.click("Overtime (endless)");
    await f.see(/how deep can the town stay present/i, { note: "the run kind's detail line follows the pick" });
    await settle();
    await shot("time-card");
  },
});
