import { describe, expect, test } from "bun:test";

import type { GameContext } from "../runtime/gameContext";
import { playControlsActive } from "./controlGate";
import { GAME_PHASE_STORE_KEY, gamePhase, isPlaying, setGamePhase, syncLifecyclePhase } from "./gamePhase";

function fakeCtx(): GameContext {
  const map = new Map<string, unknown>();
  return {
    game: { store: { set: (k: string, v: unknown) => map.set(k, v), get: (k: string) => map.get(k) } },
  } as unknown as GameContext;
}

describe("gamePhase", () => {
  test("defaults to playing when unset", () => {
    const ctx = fakeCtx();
    expect(gamePhase(ctx)).toBe("playing");
    expect(isPlaying(ctx)).toBe(true);
  });

  test("setGamePhase publishes phase and gates touch controls", () => {
    const ctx = fakeCtx();
    setGamePhase(ctx, "menu");
    expect(ctx.game.store.get(GAME_PHASE_STORE_KEY)).toBe("menu");
    expect(gamePhase(ctx)).toBe("menu");
    expect(playControlsActive(ctx)).toBe(false);

    setGamePhase(ctx, "playing");
    expect(playControlsActive(ctx)).toBe(true);
    expect(isPlaying(ctx)).toBe(true);

    setGamePhase(ctx, "ended");
    expect(playControlsActive(ctx)).toBe(false);
    expect(isPlaying(ctx)).toBe(false);
  });

  test('syncLifecyclePhase treats the "always-live" declaration as no lifecycle sync', () => {
    const ctx = fakeCtx();
    syncLifecyclePhase(ctx, "always-live");
    expect(ctx.game.store.get(GAME_PHASE_STORE_KEY)).toBeUndefined();
    expect(gamePhase(ctx)).toBe("playing");
  });
});
