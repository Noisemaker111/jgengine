import { describe, expect, test } from "bun:test";

import type { GameContext } from "../runtime/gameContext";
import {
  PLAY_CONTROLS_STORE_KEY, actionContextStack, activeActionCodes,
  playControlsActive, setPlayControlsActive, suspendPlayControls,
} from "./controlGate";

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
  test("independent owners release in either order without enabling a remaining suspension", () => {
    for (const order of [[0, 1], [1, 0]]) {
      const ctx = fakeCtx();
      const release = [suspendPlayControls(ctx), suspendPlayControls(ctx)];
      expect(playControlsActive(ctx)).toBe(false);
      release[order[0]!]!();
      release[order[0]!]!();
      expect(playControlsActive(ctx)).toBe(false);
      release[order[1]!]!();
      expect(playControlsActive(ctx)).toBe(true);
    }
  });

  test("release preserves the existing gate and legacy enable cannot bypass a lease", () => {
    const ctx = fakeCtx();
    setPlayControlsActive(ctx, false);
    const release = suspendPlayControls(ctx);
    release();
    expect(playControlsActive(ctx)).toBe(false);
    const nextRelease = suspendPlayControls(ctx);
    setPlayControlsActive(ctx, true);
    expect(playControlsActive(ctx)).toBe(false);
    nextRelease();
    expect(playControlsActive(ctx)).toBe(true);
  });

  test("suspension blocks a gameplay layer pushed later and restores its bindings on release", () => {
    const ctx = fakeCtx();
    const release = suspendPlayControls(ctx);
    actionContextStack(ctx).push({ id: "driving", codes: { steer: ["KeyA"] }, passthrough: true });
    expect(activeActionCodes(ctx, { move: ["KeyW"] })).toEqual({});
    release();
    expect(activeActionCodes(ctx, { move: ["KeyW"] })).toEqual({ move: ["KeyW"], steer: ["KeyA"] });
  });

  test("binding snapshots retain current owners without carrying them into a replacement context", () => {
    const ctx = fakeCtx();
    const stack = actionContextStack(ctx);
    stack.push({ id: "driving", codes: { steer: ["KeyA"] }, passthrough: true });
    const release = suspendPlayControls(ctx);
    const saved = stack.snapshot();
    expect(saved.contexts.map((context) => context.id)).toEqual(["driving"]);
    stack.restore(saved);
    expect(playControlsActive(ctx)).toBe(false);
    expect(activeActionCodes(ctx, { move: ["KeyW"] })).toEqual({});
    const replacement = fakeCtx();
    actionContextStack(replacement).restore(saved);
    expect(playControlsActive(replacement)).toBe(true);
    expect(activeActionCodes(replacement, { move: ["KeyW"] })).toEqual({ move: ["KeyW"], steer: ["KeyA"] });
    release();
    expect(playControlsActive(ctx)).toBe(true);
  });

  test("an old release cannot remove a later lease after stack restore or affect a replacement context", () => {
    const oldCtx = fakeCtx();
    const stack = actionContextStack(oldCtx);
    const empty = stack.snapshot();
    const releaseOld = suspendPlayControls(oldCtx);
    stack.restore(empty);
    const releaseNext = suspendPlayControls(oldCtx);
    const replacement = fakeCtx();
    const releaseReplacement = suspendPlayControls(replacement);
    releaseOld();
    expect(playControlsActive(oldCtx)).toBe(false);
    expect(playControlsActive(replacement)).toBe(false);
    releaseNext();
    expect(playControlsActive(oldCtx)).toBe(true);
    expect(playControlsActive(replacement)).toBe(false);
    releaseReplacement();
    expect(playControlsActive(replacement)).toBe(true);
  });
});
