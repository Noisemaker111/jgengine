import { describe, expect, test } from "bun:test";

import type { GameContext } from "../runtime/gameContext";
import { PLAY_CONTROLS_STORE_KEY, playControlsActive, setPlayControlsActive } from "./controlGate";

function fakeCtx(): GameContext {
  const map = new Map<string, unknown>();
  return {
    game: { store: { set: (k: string, v: unknown) => map.set(k, v), get: (k: string) => map.get(k) } },
  } as unknown as GameContext;
}

describe("controlGate", () => {
  test("defaults active when unset so always-live games need no wiring", () => {
    expect(playControlsActive(fakeCtx())).toBe(true);
  });

  test("setPlayControlsActive toggles the store-backed gate the shell reads each frame", () => {
    const ctx = fakeCtx();
    setPlayControlsActive(ctx, false);
    expect(ctx.game.store.get(PLAY_CONTROLS_STORE_KEY)).toBe(false);
    expect(playControlsActive(ctx)).toBe(false);

    setPlayControlsActive(ctx, true);
    expect(playControlsActive(ctx)).toBe(true);
  });
});
