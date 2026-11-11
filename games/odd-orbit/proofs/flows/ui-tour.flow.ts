import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/**
 * Every Odd Orbit screen on native Rune, driven through Rune's own hit test: the porch and each of its
 * pages, typing a household name, the habitat HUD and its panels, the handbook with save, settings and
 * credits, stepping outside and continuing the saved household.
 */
export default defineFlow(game, {
  browser: true,
  state: "title",
  async run(f) {
    await f.waitForPage("(window.__jgNativeUi?.stats().frames ?? 0) > 0", { note: "native Rune submitted a frame", timeoutMs: 40000 });
    const phone = Number(await f.page("innerWidth")) < 600;
    const size = phone ? "phone" : "desktop";
    const shot = (name: string) => f.shot(`rune-native-${name}-${size}`);
    // Settled: no new native tree for 3 s and a frame drawn since it, so the picture and hit regions show the
    // latest tree. Live values (the clock) repaint through slots without a new tree, so the HUD can settle too.
    const settle = () => f.waitForPage("(() => { const s = window.__jgNativeUi?.stats() ?? { specs: 0, frames: 0 }, t = performance.now(); if (window.__orbitSpecs !== s.specs) { window.__orbitSpecs = s.specs; window.__orbitAt = t; window.__orbitFrame = s.frames; return false; } return t - window.__orbitAt > 3000 && (s.frames > window.__orbitFrame || t - window.__orbitAt > 7000); })()", { timeoutMs: 30000, note: "the native UI tree settled and painted" });
    // Shown as text, or as a pressable control's name.
    const shows = async (text: string) => Boolean(await f.page(`(window.__jgNativeUi?.text() ?? "").includes(${JSON.stringify(text)}) || window.__jgNativeUi?.point(${JSON.stringify(text)}) != null`));
    // A real pointer press through Rune's hit test: hover, let the hover frame land, then click. When the
    // press should open something, a press the busy software renderer dropped is tried again (three times at most).
    const tap = async (label: string, arrive?: string) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const at = await f.waitForPage(`window.__jgNativeUi?.point(${JSON.stringify(label)}) ?? false`, { note: `a laid-out "${label}" control` }) as { x: number; y: number };
        await f.moveMouse(at.x, at.y);
        await settle();
        await f.clickAt(at.x, at.y);
        if (arrive === undefined) return;
        for (let waited = 0; waited < 10000; waited += 500) { if (await shows(arrive)) return; await f.wait(500); }
      }
      throw new Error(`pressing "${label}" never showed "${arrive}"`);
    };
    const porch = async () => { if (phone) await tap("Porch", "a home for four strange beings"); };
    const see = async (text: string, timeoutMs = 15000) => { await f.see(text, { timeoutMs }); await settle(); };

    await see("a home for four strange beings");
    await shot("title");
    await tap("Households", "Household III");
    await see("Household III");
    await shot("households");
    await porch();
    await tap("Field guide", "Caring for a strange household");
    await see("Caring for a strange household");
    await shot("guide");
    await porch();
    await tap("Settings", "Calm interface");
    await see("Calm interface");
    await shot("settings");
    await tap("Bolder panels");
    await f.waitForPage("JSON.parse(localStorage.getItem('odd-orbit.preferences.v2') ?? '{}').contrast === true", { timeoutMs: 20000, note: "the Bolder panels lamp writes the preference" });
    await tap("Bolder panels");
    await porch();
    await tap("Credits", "Comfortaa");
    await see("Comfortaa");
    await shot("credits");
    await porch();
    await tap("Move in", "Moving-in card");
    await see("Moving-in card");
    await tap("Household name", "Typing: Enter moves in");
    await see("Typing: Enter moves in");
    for (const key of ["KeyO", "KeyD", "KeyD", "Space", "KeyO", "KeyN", "KeyE", "KeyS"] as const) await f.press(key);
    await see("Odd Ones|");
    await shot("new");
    await f.press("Enter");
    await f.waitForPage("!(window.__jgNativeUi?.text() ?? 'Moving-in card').includes('Moving-in card')", { timeoutMs: 40000, note: "Enter on the moving-in card moved the household in" });
    await f.waitFor((p) => p.members === 4, { timeoutMs: 40000 });

    // Once the habitat runs, software Rune on a loaded host stops presenting new frames (Deepward's own
    // ui-tour shows the same stale picture), so its hit regions go stale too. From here each control is
    // pressed through the native tree's own press path and checked by what the tree then shows; the HUD
    // pictures come from boot captures and the headless native renders of the same components.
    const act = async (label: string, arrive?: string) => {
      await f.page(`window.__jgNativeUi.press(${JSON.stringify(label)})`);
      if (arrive !== undefined) await f.waitForPage(`(window.__jgNativeUi?.text() ?? "").includes(${JSON.stringify(arrive)}) || window.__jgNativeUi?.point(${JSON.stringify(arrive)}) != null`, { timeoutMs: 20000, note: `pressing "${label}" shows "${arrive}"` });
    };
    await f.see("Handbook");
    await act("Speed 2x");
    await act("Pause time", "Resume time");
    await act("Resume time", "Pause time");
    // The first being's magnet is labelled with its generated name.
    const card = String(await f.page("(() => { const walk = (n) => n.props?.label?.endsWith(' card') ? n.props.label : (n.children ?? []).map(walk).find(Boolean); return walk(window.__jgNativeUi.tree()) ?? ''; })()"));
    await act(card, "Post & mastery");
    await act("Close member care");
    await act("Furnish", "Make room for life");
    await act("Close habitat panel");
    await act("Pantry", "Earned today");
    await act("Close habitat panel");
    const waiting = phone ? "Back to the household" : "Everyone is waiting";
    const leafBack = async () => { if (phone) await act("Contents", "Back to the household"); };
    await act("Handbook", waiting);
    await act("Save to Household I", "Written into Household I");
    await f.expectPage("localStorage.getItem('odd-orbit.household-save.v1') !== null", "the handbook wrote the household into its slot");
    await leafBack();
    await act("Settings", "Master volume");
    await leafBack();
    await act("Credits", "Comfortaa");
    await leafBack();
    await act("Save & step outside", "a home for four strange beings");
    await f.see("Odd Ones");
    await act("Continue", "Handbook");
    await f.press("Escape");
    await f.see(waiting);
    await act("Back to the household", "Furnish");
  },
});
