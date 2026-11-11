import { expect, test } from "bun:test";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { menuPane } from "@jgengine/core/game/gameFlow";
import { onboardingOf } from "@jgengine/core/onboarding/onboardingSystem";

import { mountRuneUi } from "../../../proofs/runeUiFixture";
import { storeView } from "../base";
import { BAG, HOTBAR } from "../bags";
import { survivorLook } from "../character";
import { creaturesView } from "../creatures";
import { openScreen } from "../screens";
import { survivorView } from "../survivor";

const SIZES = [[1280, 720], [390, 844]] as const;

test("title pages open from their buttons, mirror the menu pane, and Back returns to the title", async () => {
  for (const [width, height] of SIZES) {
    const ui = await mountRuneUi("title", width, height);
    try {
      for (const [verb, pane, shows] of [["Controls", "controls", "Whistle your tames to follow / stay"], ["Settings", "settings", "Master volume"], ["Credits", "credits", "Fernwild — made with JGengine."]] as const) {
        await ui.press(verb);
        expect(menuPane(ui.ctx), `${verb} at ${width}`).toBe(pane);
        expect(ui.text()).toContain(shows);
        await ui.press("Back");
        expect(menuPane(ui.ctx)).toBeNull();
        expect(ui.labels()).toContain("New game");
      }
    } finally {
      ui.unmount();
    }
  }
}, 120000);

test("settings tabs switch categories and a row press sets its value", async () => {
  const ui = await mountRuneUi("settings");
  try {
    await ui.press("Mute");
    expect(ui.sets).toContainEqual(["mute", true]);
    await ui.press("Graphics");
    expect(ui.text()).toContain("Shadows");
    await ui.press("Shadows");
    expect(ui.sets).toContainEqual(["shadows", false]);
  } finally {
    ui.unmount();
  }
}, 60000);

test("New game opens the creator; a name, a body and a region chosen there start the run as that survivor", async () => {
  for (const [width, height] of SIZES) {
    const ui = await mountRuneUi("title", width, height);
    try {
      await ui.press("New game");
      expect(ui.text()).toContain("Choose where you wake");
      await ui.press("Next name");
      await ui.press("Woman 1");
      await ui.press("Wake at North Zone 1");
      expect(ui.text()).toContain("Ada");
      await ui.press("Wake up");
      ui.tick(0.5);
      await ui.settle();
      expect(gamePhase(ui.ctx), `run starts at ${width}`).toBe("playing");
      expect(survivorLook(ui.ctx)).toMatchObject({ name: "Ada", body: "woman-1", region: "spawn_north_1" });
    } finally {
      ui.unmount();
    }
  }
}, 120000);

test("the inventory screen crafts, levels a stat, moves an item, switches tabs and closes on I or Close", async () => {
  for (const [width, height] of SIZES) {
    const ui = await mountRuneUi("inventory", width, height);
    try {
      await ui.press("Craft Stone Pick");
      expect(survivorView(ui.ctx).queue.length, `craft at ${width}`).toBeGreaterThan(0);
      await ui.press("Craft five Stone Pick");
      expect(survivorView(ui.ctx).queue.length).toBeGreaterThan(1);
      const points = survivorView(ui.ctx).statPoints;
      await ui.press("Level Health");
      expect(survivorView(ui.ctx).statPoints).toBe(points - 1);
      const inHotbar = ui.ctx.player.inventory.count(HOTBAR, "wood");
      await ui.press("Wood ×");
      expect(ui.ctx.player.inventory.count(HOTBAR, "wood")).toBeGreaterThan(inHotbar);
      await ui.press("Engrams");
      expect(openScreen(ui.ctx)).toBe("engrams");
      await ui.press("Learn Campfire");
      expect(survivorView(ui.ctx).engrams.find((engram) => engram.id === "campfire")?.learned).toBe(true);
      await ui.press("Dossier");
      expect(openScreen(ui.ctx)).toBe("dossier");
      await ui.key("KeyI");
      expect(openScreen(ui.ctx)).toBeNull();
      ui.session.command("screen", { screen: "inventory" });
      await ui.settle();
      await ui.press("Close");
      expect(openScreen(ui.ctx)).toBeNull();
    } finally {
      ui.unmount();
    }
  }
}, 180000);

test("a tame's inventory takes orders and closes; a storage box takes and returns items", async () => {
  const tame = await mountRuneUi("creature");
  try {
    expect(openScreen(tame.ctx)).toBe("creature");
    await tame.press("Follow (T)");
    expect(creaturesView(tame.ctx).viewing?.order).toBe("follow");
    await tame.press("Aggressive");
    expect(creaturesView(tame.ctx).viewing?.stance).toBe("aggressive");
    await tame.press("Close");
    expect(openScreen(tame.ctx)).toBeNull();
  } finally {
    tame.unmount();
  }
  const box = await mountRuneUi("storage");
  try {
    expect(storeView(box.ctx)?.slots.some((slot) => slot?.itemId === "stone")).toBe(true);
    await box.press("Take Stone");
    expect(storeView(box.ctx)?.slots.some((slot) => slot?.itemId === "stone")).toBe(false);
    const stone = box.ctx.player.inventory.count(BAG, "stone");
    expect(stone).toBeGreaterThan(0);
    await box.press("Stone ×");
    expect(box.ctx.player.inventory.count(BAG, "stone")).toBe(0);
    await box.key("Escape");
    expect(openScreen(box.ctx)).toBeNull();
  } finally {
    box.unmount();
  }
}, 120000);

test("pause saves, quits to the title with Continue offered, and Continue loads the run back into play", async () => {
  const ui = await mountRuneUi("paused");
  try {
    expect(ui.labels()).toContain("Quit to title");
    await ui.press("Save");
    expect(await ui.ctx.game.save?.hasSave()).toBe(true);
    await ui.press("Settings");
    expect(ui.text()).toContain("Master volume");
    await ui.press("Back");
    await ui.press("Quit to title");
    await ui.settle();
    expect(gamePhase(ui.ctx)).toBe("menu");
    await ui.settle();
    await ui.press("Continue");
    await ui.settle();
    expect(gamePhase(ui.ctx)).toBe("playing");
  } finally {
    ui.unmount();
  }
}, 120000);

test("Resume leaves pause, and the HUD's Skip tutorial ends the survivor's path", async () => {
  const ui = await mountRuneUi("paused");
  try {
    await ui.press("Resume");
    expect(gamePhase(ui.ctx)).toBe("playing");
    await ui.press("Skip tutorial");
    expect(onboardingOf(ui.ctx)?.run().isFinished()).toBe(true);
  } finally {
    ui.unmount();
  }
}, 60000);
