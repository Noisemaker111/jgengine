import { describe, expect, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { openTitle, togglePause, playGame } from "@jgengine/core/game/gameFlow";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { SettingsControllerProvider, type SettingsController } from "@jgengine/core/settings/settings.view";
import { GameProvider } from "@jgengine/react/provider";

import { GameFlowUI, type GameFlowMenuContent } from "./gameFlowMenus.view";

function fixture(): GameContext {
  return createGameContext({
    definition: defineGameDefinition({ name: "Flow menus", assets: createAssetCatalog(), multiplayer: "off", persist: false }),
    content: {},
    player: { userId: "player", isNew: true },
  });
}

const CONTROLLER: SettingsController = {
  categories: [{ id: "graphics", label: "Graphics", rows: [], keybinds: [] }],
  actions: [],
  variant: "panel",
  surface: false,
  isOpen: false,
  open: () => undefined,
  close: () => undefined,
  setOpen: () => undefined,
};

const MENU: GameFlowMenuContent = {
  name: "Flow menus",
  controls: [["WASD", "walk"]],
  credits: { sections: [{ heading: "Engine", entries: [{ label: "JGengine", detail: "menus" }] }], notice: "Thanks." },
};

function render(ctx: GameContext, menu: GameFlowMenuContent, withSettings: boolean): string {
  const ui: ReactNode = createElement(GameFlowUI, { menu, hud: createElement("div", { "data-hud": "" }) });
  const inner = withSettings ? createElement(SettingsControllerProvider, { controller: CONTROLLER }, ui) : ui;
  return renderToStaticMarkup(createElement(GameProvider, { context: ctx }, inner));
}

describe("GameFlowUI", () => {
  test("the title offers Settings when the game has settings, and Credits from a credits document", () => {
    const ctx = fixture();
    openTitle(ctx);
    const html = render(ctx, MENU, true);
    expect(html).toContain('data-jg-menu-item="settings"');
    expect(html).toContain('data-jg-menu-item="credits"');
    expect(render(ctx, MENU, false)).not.toContain('data-jg-menu-item="settings"');
    expect(render(ctx, { ...MENU, settings: false }, true)).not.toContain('data-jg-menu-item="settings"');
  });

  test("the pause menu offers Settings too", () => {
    const ctx = fixture();
    openTitle(ctx);
    playGame(ctx);
    togglePause(ctx);
    const html = render(ctx, MENU, true);
    expect(html).toContain('data-jg-menu-item="settings"');
    expect(html).toContain('data-jg-menu-item="title"');
  });
});
