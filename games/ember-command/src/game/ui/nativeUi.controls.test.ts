import { afterEach, expect, test } from "bun:test";

import { fixtureSettings, mountEmberUi } from "../../../proofs/runeUiFixture";
import { hudStore } from "../hudStore";
import { campaignSlot, recordOfSlot } from "../campaignSave";
import { preferences } from "../preferences";
import { session } from "../session";
import { signKey } from "./CommandMenu";

let mounted: Awaited<ReturnType<typeof mountEmberUi>> | null = null;
const mount = async (...args: Parameters<typeof mountEmberUi>) => (mounted = await mountEmberUi(...args));
afterEach(() => { mounted?.unmount(); mounted = null; });
const SIZES = [[1280, 720], [390, 844]] as const;

test("the HUD's command tokens and formation tabs send their orders", async () => {
  for (const [width, height] of SIZES) {
    const ui = await mount("hud", width, height);
    await ui.press("Build Farm");
    expect(session.buildArmed, `farm armed at ${width}`).toBe("farm");
    await ui.press("Rally Point");
    expect(session.rallyArmed, `rally armed at ${width}`).toBe(true);
    if (width < 700) await ui.press("Show map");
    await ui.press("Wedge formation");
    expect(session.formation.kind, `wedge at ${width}`).toBe("wedge");
    ui.unmount(); mounted = null;
  }
});

test("the wax seal pauses the battle, and the dispatch case resumes it", async () => {
  for (const [width, height] of SIZES) {
    const ui = await mount("hud", width, height);
    await ui.press("Pause battle");
    expect(hudStore.get().phase).toBe("paused");
    await ui.settle();
    expect(ui.text()).toContain("Orders on hold");
    await ui.press("Resume the mission");
    expect(hudStore.get().phase).toBe("playing");
    await ui.settle();
    expect(ui.text()).not.toContain("Orders on hold");
    ui.unmount(); mounted = null;
  }
});

test("the dispatch case writes the campaign record and returns to the title", async () => {
  const ui = await mount("paused");
  await ui.press("Save the campaign");
  // The headless page has no scene capture, so the record waits out the thumbnail binding (5 s) and keeps no picture.
  for (let i = 0; i < 160 && !ui.text().includes("Orders written"); i += 1) await ui.settle().then(() => new Promise((r) => setTimeout(r, 50)));
  expect(ui.text()).toContain("Orders written to the campaign record");
  expect((await recordOfSlot(ui.ctx, campaignSlot(ui.ctx)))?.gold).toBe(Math.floor(ui.ctx.game.economy.balance("commander", "gold")));
  await ui.press("Return to title");
  for (let i = 0; i < 160 && !ui.text().includes("Take command"); i += 1) await ui.settle().then(() => new Promise((r) => setTimeout(r, 50)));
  expect(hudStore.get().phase).toBe("ready");
  await ui.settle();
  expect(ui.text()).toContain("Take command");
}, 30000);

test("the settings sheet toggles field preferences and steps the shell's rows", async () => {
  const recorded = fixtureSettings();
  const ui = await mount("settings", 1280, 720, recorded.controller);
  expect(preferences(ui.ctx).get().largeText).toBe(false);
  await ui.press("Larger HUD text");
  expect(preferences(ui.ctx).get().largeText).toBe(true);
  await ui.press("High contrast");
  expect(preferences(ui.ctx).get().highContrast).toBe(true);
  await ui.adjust("Master volume", 1);
  expect(recorded.volume.at(-1)).toBeCloseTo(0.81, 5);
  await ui.press("Mute");
  expect(recorded.mute).toEqual([true]);
});

test("the title starts a free skirmish, and the commission signs a commander by keys or by draw", async () => {
  let ui = await mount("title");
  await ui.press("Free skirmish");
  expect(hudStore.get().phase).toBe("playing");
  ui.unmount(); mounted = null;

  ui = await mount("new");
  await ui.press("Draw a name");
  expect(ui.text()).toContain("Mara Vell");
  await ui.press("Commander");
  for (const code of ["Backspace", "Backspace", "Backspace", "Backspace", "Backspace", "Backspace", "Backspace", "Backspace", "Backspace", "KeyB", "KeyR", "KeyA", "KeyM"]) await ui.key(code);
  await ui.key("Escape");
  expect(ui.text()).toContain("Bram");
  expect(ui.text()).not.toContain("Mara Vell");
});

test("the records sheet lists the three campaign folios with an action each", async () => {
  const ui = await mount("records");
  for (const label of ["Begin Campaign I", "Begin Campaign II", "Begin Campaign III"]) expect(ui.has(label), label).toBe(true);
});

test("a level-up writ offers both picks as presses", async () => {
  const ui = await mount("levelup");
  const offer = hudStore.get().heroOffer!;
  for (const option of offer.options) expect(ui.has(`${option.label} — ${option.kind === "active" ? "act" : "item"}`)).toBe(true);
});

test("signing turns key codes into a capitalised name", () => {
  const typed = ["KeyB", "KeyR", "KeyA", "KeyM", "Space", "KeyH", "KeyO"].reduce(signKey, "");
  expect(typed).toBe("Bram Ho");
  expect(signKey(typed, "Backspace")).toBe("Bram H");
  expect(signKey("x".repeat(24), "KeyA")).toBe("x".repeat(24));
});
