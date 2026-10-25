import { afterEach, describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { memorySaveBackend } from "@jgengine/core/game/saveStore";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { earn } from "./cash";
import { resetCharacterState } from "./characters";
import { inventories } from "./inventories";
import {
  enterDowned,
  POWER_SURGE_HEALTH_FRACTION,
  powerSurge,
  RESERVE_WINDOW_SECONDS,
  RESPAWN_CASH_FRACTION,
  reservePhase,
  reserveProbe,
  reserveSave,
  restoreReserve,
  respawnFee,
  tickDowned,
} from "./handroll";
import { reserveStore } from "./stores";

afterEach(() => resetCharacterState());

/**
 * The Emergency Reserve adoption contract, on this game's own numbers: the shared `downed-revive`
 * state runs the 12 s window and the revive fraction, and the game keeps the surge shield and the
 * 7% reconstruct fee it always paid.
 */
function boot(): GameContext {
  return createGameContext({
    definition: defineGameDefinition({
      name: "scrap-signal-reserve-test",
      assets: createAssetCatalog(),
      multiplayer: "off",
      persist: true,
      features: { quest: true, trade: true },
      inventories,
    }),
    content: {},
    player: { userId: "p1", isNew: true },
    save: { backend: memorySaveBackend(), key: "jgengine:save:scrap-reserve", mode: "manual" },
  });
}

function wounded(): GameContext {
  const ctx = boot();
  ctx.scene.entity.spawn("player", { id: "p1", position: [0, 0, 0] });
  ctx.scene.entity.stats.set("p1", "health", { current: 20, max: 100 });
  ctx.scene.entity.stats.set("p1", "shield", { current: 0, max: 40 });
  return ctx;
}

describe("scrap-signal Emergency Reserve", () => {
  test("the shared state runs the game's 12 s window and reports the bleed-out", () => {
    const ctx = wounded();
    enterDowned(ctx);
    expect(reservePhase(ctx)).toBe("downed");
    expect(reserveProbe(ctx).reserveBleedout).toBe(RESERVE_WINDOW_SECONDS);
    expect(reserveStore.read(ctx)).toEqual({ phase: "downed", secondsLeft: RESERVE_WINDOW_SECONDS });

    // 11.9 s in the chassis is still downed; the last tenth ends it, and `died` is the game's cue.
    expect(tickDowned(ctx, RESERVE_WINDOW_SECONDS - 0.1)).toEqual([]);
    expect(reservePhase(ctx)).toBe("downed");
    expect(tickDowned(ctx, 0.1).map((event) => event.kind)).toEqual(["died"]);
    expect(reservePhase(ctx)).toBe("dead");
  });

  test("a Power Surge pays the shared 40% revive fraction plus the game's shield", () => {
    const ctx = wounded();
    enterDowned(ctx);
    powerSurge(ctx);
    expect(reservePhase(ctx)).toBe("alive");
    const health = ctx.scene.entity.stats.get("p1", "health");
    expect(health?.current).toBe(20 + Math.round(100 * POWER_SURGE_HEALTH_FRACTION));
    const shield = ctx.scene.entity.stats.get("p1", "shield");
    expect(shield?.current).toBe(20);
    expect(reserveStore.read(ctx)).toEqual({ phase: "alive", secondsLeft: 0 });
  });

  test("the reconstruct fee is the game's own 7% of the wallet, paid by the game", () => {
    expect(respawnFee(1000)).toBe(70);
    expect(respawnFee(14)).toBe(0);
    expect(RESPAWN_CASH_FRACTION).toBe(0.07);
  });

  test("the save carries the shared snapshot and resumes the window that was left", () => {
    const ctx = wounded();
    enterDowned(ctx);
    tickDowned(ctx, 3);
    const saved = reserveSave(ctx);
    expect(saved["p1"]?.phase).toBe("downed");
    expect(saved["p1"]?.bleedoutRemaining).toBe(RESERVE_WINDOW_SECONDS - 3);

    const reboot = wounded();
    restoreReserve(reboot, saved);
    expect(reservePhase(reboot)).toBe("downed");
    expect(reserveProbe(reboot).reserveBleedout).toBe(RESERVE_WINDOW_SECONDS - 3);
    expect(reserveStore.read(reboot).phase).toBe("downed");
  });
});
