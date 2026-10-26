import { expect, test } from "bun:test";
import { act, createRoot, extend } from "@react-three/fiber";
import { createElement } from "react";
import * as THREE from "three";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { GameProvider } from "@jgengine/react/provider";

import type { AudioEngine } from "./audioEngine";
import { FeedbackHost } from "./FeedbackHost";

test("a local pickup reaches a connected pad through the shared haptics route", async () => {
  const pads = navigator as Navigator & { getGamepads?: () => unknown[] };
  const realPads = pads.getGamepads;
  pads.getGamepads = () => [{ connected: true, vibrationActuator: {} }];
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "Feedback host", assets: createAssetCatalog(), multiplayer: "off", persist: false }),
    content: {},
    player: { userId: "player", isNew: true },
  });
  const engine = { resume() {} } as unknown as AudioEngine;
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  extend(THREE);
  const root = createRoot({} as HTMLCanvasElement);
  await root.configure({
    frameloop: "never",
    size: { width: 100, height: 100, top: 0, left: 0 },
    dpr: 1,
    gl: () => ({ render() {}, setSize() {}, setPixelRatio() {} }) as unknown as THREE.WebGLRenderer,
  });
  try {
    await act(async () => {
      root.render(createElement(GameProvider, { context: ctx }, createElement(FeedbackHost, { ctx, engine })));
    });
    expect(ctx.input.haptics("player").mix(0).weak).toBe(0);
    ctx.game.events.emit("worldItem.picked_up", { instanceId: "i1", userId: "player", itemId: "coin", rarity: "common", count: 1 });
    expect(ctx.input.haptics("player").mix(0).weak).toBeGreaterThan(0);
  } finally {
    await act(async () => root.unmount());
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
    pads.getGamepads = realPads;
  }
});
