import { expect, test } from "bun:test";
import { act, createRoot, extend } from "@react-three/fiber";
import { createElement } from "react";
import * as THREE from "three";

import { createCameraShake } from "@jgengine/core/camera/shake/cameraShake";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { GameProvider } from "@jgengine/react/provider";

import { HitReactionShake } from "./HitReactionShake.draw";
import { CALIBRATED_TRAUMA_DECAY_PER_SECOND, CameraShakeContext } from "./shakeChannel.draw";

test("a hit reaction's trauma, or its raw amplitude and decay, reaches the rig's shake", async () => {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "Combat shake", assets: createAssetCatalog(), multiplayer: "off", persist: false }),
    content: {},
    player: { userId: "player", isNew: true },
  });
  const shake = createCameraShake({ decayPerSecond: 0 });
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
      root.render(createElement(GameProvider, { context: ctx }, createElement(CameraShakeContext.Provider, { value: shake }, createElement(HitReactionShake))));
    });
    ctx.game.events.emit("combat.hitReaction", { position: [0, 0, 0], hitstopMs: 0, trauma: 0.4 });
    expect(shake.trauma()).toBeCloseTo(0.4);
    shake.update(0.1);
    expect(shake.trauma()).toBeCloseTo(0.4 - CALIBRATED_TRAUMA_DECAY_PER_SECOND * 0.1);
    const before = shake.trauma();
    ctx.game.events.emit("combat.hitReaction", { position: [0, 0, 0], hitstopMs: 0, shake: { amplitude: 0.3, decay: 3 } });
    expect(shake.trauma()).toBeCloseTo(before + 0.3);
    shake.update(0.1);
    expect(shake.trauma()).toBeCloseTo(before + 0.3 - 0.3);
    ctx.game.events.emit("combat.hitReaction", { position: [0, 0, 0], hitstopMs: 0 });
    expect(shake.trauma()).toBeCloseTo(before);
  } finally {
    await act(async () => root.unmount());
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
