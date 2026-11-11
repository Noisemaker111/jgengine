import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/**
 * The native Rune front end: title, keeps, settings, credits and the New Defense commission. Run at desktop and phone sizes; each shot carries the viewport width in its name.
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
    // Software Rune draws a few frames a second here, so wait for the title's controls to be pressable again.
    const backToTitle = async () => {
      await f.click("Back");
      await f.waitForPage("window.__jgNativeUi?.point('Credits') != null && window.__jgNativeUi?.point('Back') == null", { timeoutMs: 20000, note: "Back returns to the title" });
      await settle();
    };
    await f.waitForPage("(window.__jgNativeUi?.stats().frames ?? 0) > 0", { timeoutMs: 60000, note: "native Rune submitted a frame" });
    await f.see(/new defense/i, { timeoutMs: 40000 });
    await settle();
    await shot("title");

    await f.click("Keeps");
    await f.see(/unclaimed/i);
    await settle();
    await shot("keeps-empty");
    await backToTitle();

    await f.click("Settings");
    await f.see(/prepare the keep/i);
    await settle();
    await shot("settings");
    await backToTitle();

    await f.click("Credits");
    await f.see(/jgengine/i);
    await settle();
    await shot("credits");
    await backToTitle();

    await f.click("New Defense");
    await f.see(/commission/i);
    await settle();
    // The commander signs by keyboard: real key presses into the native field, sealed with Enter.
    await f.click("Commander name");
    await f.see(/type your name/i, { note: "the name field opens for typing" });
    for (const key of ["KeyA", "KeyD", "KeyA", "Space", "KeyR", "KeyO", "KeyO", "KeyK"] as const) await f.press(key);
    await f.press("Enter");
    await f.see(/ada rook/i, { timeoutMs: 20000, note: "the typed name is sealed into the commission" });
    await f.click("Next name");
    await f.click("Squire");
    await f.see(/mara vell/i);
    await settle();
    await shot("commission");
  },
});
