import { expect, test } from "bun:test";
import { createElement } from "@jgengine/core/ui/jsx";

import { mountTestDraws } from "@jgengine/core/frame/testEngineHost.draw";
import { createCameraShake } from "@jgengine/core/camera/shake/cameraShake";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { GameProvider } from "@jgengine/react/provider";

import { HitReactionShake } from "./HitReactionShake.draw";
import { CALIBRATED_TRAUMA_DECAY_PER_SECOND } from "./cameraShake";
import { CameraShakeContext } from "./shakeChannel.draw";

test("a hit reaction's trauma, or its raw amplitude and decay, reaches the rig's shake", async () => {
  const ctx = createGameContext({
    definition: defineGameDefinition({ name: "Combat shake", assets: createAssetCatalog(), multiplayer: "off", persist: false }),
    content: {},
    player: { userId: "player", isNew: true },
  });
  const shake = createCameraShake({ decayPerSecond: 0 });
  const mounted = await mountTestDraws(
    createElement(GameProvider, { context: ctx }, createElement(CameraShakeContext.Provider, { value: shake }, createElement(HitReactionShake))),
    { width: 100, height: 100 },
  );
  try {
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
    await mounted.unmount();
  }
});
