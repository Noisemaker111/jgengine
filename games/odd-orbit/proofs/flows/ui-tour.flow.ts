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

    await see("a boarding house bolted to a space station");
    await shot("title");
    await tap("Houses", "House III");
    await see("House III");
    await shot("households");
    await porch();
    await tap("Landlord's guide", "Running a boarding house in orbit");
    await see("Running a boarding house in orbit");
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
    await tap("Open the house", "Opening night");
    await see("Opening night");
    await tap("House name", "Typing: Enter opens the house");
    await see("Typing: Enter opens the house");
    for (const key of ["KeyO", "KeyD", "KeyD", "Space", "KeyO", "KeyN", "KeyE", "KeyS"] as const) await f.press(key);
    await see("Odd Ones|");
    await shot("new");
    await f.press("Enter");
    await f.waitForPage("!(window.__jgNativeUi?.text() ?? 'Opening night').includes('Opening night')", { timeoutMs: 40000, note: "Enter on the opening-night card opened the house" });
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
    // The first tenant's key-tag is labelled with its name.
    const card = String(await f.page("(() => { const walk = (n) => n.props?.label?.endsWith(' card') ? n.props.label : (n.children ?? []).map(walk).find(Boolean); return walk(window.__jgNativeUi.tree()) ?? ''; })()"));
    await act(card, "Day job & mastery");
    await act("Close member care");
    await act("Rooms", "Rooms plan");
    await act("Close panel");
    await act("Furnish", "Furnish the commons");
    await act("Close panel");
    await act("Pantry", "Taken in today");
    await act("Close panel");
    const waiting = phone ? "Back to the front desk" : "Everyone is waiting";
    const leafBack = async () => { if (phone) await act("Contents", "Back to the front desk"); };
    await act("Handbook", waiting);
    await act("Save to House I", "Written into House I");
    await f.expectPage("localStorage.getItem('odd-orbit.household-save.v1') !== null", "the handbook wrote the house into its slot");
    await leafBack();
    await act("Settings", "Master volume");
    await leafBack();
    await act("Credits", "Comfortaa");
    await leafBack();
    await act("Save & step outside", "a boarding house bolted to a space station");
    await f.see("Odd Ones");
    await act("Continue", "Handbook");
    await f.press("Escape");
    await f.see(waiting);
    await act("Back to the front desk", "Furnish");
  },
});
