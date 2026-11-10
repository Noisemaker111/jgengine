import { expect, test } from "bun:test";
import { createElement } from "react";

import { acquireTestDom, mountTestDraws } from "@jgengine/core/frame/testEngineHost.draw";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { GameProvider } from "@jgengine/react/provider";

import type { AudioEngine } from "./audioEngine.view";
import { FeedbackHost } from "./FeedbackHost.view";

test("a local pickup reaches a connected pad through the shared haptics route", async () => {
  // The DOM first: it brings its own `navigator`, which the pad stub below has to land on.
  const releaseDom = await acquireTestDom();
  const pads = navigator as Navigator & { getGamepads?: () => unknown[] };
  const realPads = pads.getGamepads;
  pads.getGamepads = () => [{ connected: true, vibrationActuator: {} }];
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "Feedback host", assets: createAssetCatalog(), multiplayer: "off", persist: false }),
    content: {},
    player: { userId: "player", isNew: true },
  });
  const engine = { resume() {} } as unknown as AudioEngine;
  const mounted = await mountTestDraws(createElement(GameProvider, { context: ctx }, createElement(FeedbackHost, { ctx, engine })), { width: 100, height: 100 });
  try {
    expect(ctx.input.haptics("player").mix(0).weak).toBe(0);
    ctx.game.events.emit("worldItem.picked_up", { instanceId: "i1", userId: "player", itemId: "coin", rarity: "common", count: 1 });
    expect(ctx.input.haptics("player").mix(0).weak).toBeGreaterThan(0);
  } finally {
    await mounted.unmount();
    pads.getGamepads = realPads;
    await releaseDom();
  }
});
