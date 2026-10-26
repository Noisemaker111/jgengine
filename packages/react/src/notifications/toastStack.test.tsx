import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { GameProvider } from "../provider";
import { ToastStack } from "./toastStack";

function makeContext(): GameContext {
  return createGameContext({
    definition: defineGameDefinition({ name: "Toast stack", assets: createAssetCatalog(), multiplayer: "off", persist: false }),
    content: {},
    player: { userId: "player", isNew: true },
  });
}

const render = (ctx: GameContext, props: Parameters<typeof ToastStack>[0]) =>
  renderToStaticMarkup(createElement(GameProvider, { context: ctx }, createElement(ToastStack, props)));

describe("ToastStack", () => {
  test("draws nothing until the feed has an entry for its action", () => {
    expect(render(makeContext(), { action: "quest.updated" })).toBe("");
  });

  test("lists the feed newest first, text as-is and loot as item counts", () => {
    const ctx = makeContext();
    ctx.game.feed.push("quest.updated", "Found the key");
    ctx.game.feed.push("quest.updated", "Opened the gate");
    const html = render(ctx, { action: "quest.updated" });
    expect(html.indexOf("Opened the gate")).toBeLessThan(html.indexOf("Found the key"));
    expect(html).toContain('data-toast-stack="quest.updated"');
    const custom = render(ctx, { action: "quest.updated", limit: 1, renderToast: (entry) => `!${String(entry.data)}` });
    expect(custom).toContain("!Opened the gate");
    expect(custom).not.toContain("Found the key");
  });
});
