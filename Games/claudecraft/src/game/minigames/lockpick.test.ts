import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { solveLockPath, type LockAction } from "@jgengine/core/interaction/lockpick";

import { game } from "../../game.config";
import { content } from "../content";
import { loop } from "../../loop";
import { COPPER } from "../model";
import {
  closeLockpick,
  engageLockpick,
  LOCKBOX_CATALOG,
  lockboxCount,
  lockboxLockedOut,
  lockpickActive,
  lockSessionSpec,
  pickLock,
  type LockAnte,
  type LockboxView,
} from "./lockpick";

const USER = "lockpick-test";

function viewOf(ctx: GameContext): LockboxView | undefined {
  return ctx.game.store.get(`lockpick:${USER}`) as LockboxView | undefined;
}

function boxIds(ctx: GameContext): string[] {
  return ctx.scene.object.list().filter((entry) => entry.catalogId === LOCKBOX_CATALOG).map((entry) => entry.instanceId);
}

const DELTA: Record<LockAction, number> = { hardSet: -2, set: -1, steady: 0, ease: 1, drop: 2 };

function actionForDelta(delta: number): LockAction {
  const found = (Object.keys(DELTA) as LockAction[]).find((a) => DELTA[a] === delta);
  if (found === undefined) throw new Error(`no lock action for delta ${delta}`);
  return found;
}

function solveSession(ctx: GameContext, box: string, ante: LockAnte): boolean {
  expect(engageLockpick(ctx, USER, box, ante)).toBe(true);
  const spec = lockSessionSpec(USER);
  expect(spec).not.toBeNull();
  const path = solveLockPath(spec!);
  expect(path).not.toBeNull();
  for (let c = 1; c < path!.length; c += 1) {
    if (!lockpickActive(USER)) return viewOf(ctx)?.result === "success";
    pickLock(ctx, USER, actionForDelta(path![c]! - path![c - 1]!));
  }
  return viewOf(ctx)?.result === "success";
}

describe("lockpicking", () => {
  let ctx: GameContext;

  beforeAll(() => {
    ctx = createGameContext({ definition: game.game, content, player: { userId: USER, isNew: true } });
    loop.onInit?.(ctx);
    loop.onNewPlayer?.(ctx);
  });

  beforeEach(() => {
    closeLockpick(ctx, USER);
  });

  test("world boot places one lockbox per zone", () => {
    expect(lockboxCount()).toBeGreaterThanOrEqual(3);
    expect(boxIds(ctx).length).toBeGreaterThanOrEqual(3);
  });

  test("engaging opens a playing session with the ante's life count", () => {
    const box = boxIds(ctx)[0]!;
    expect(engageLockpick(ctx, USER, box, 3)).toBe(true);
    const view = viewOf(ctx)!;
    expect(view.result).toBe("playing");
    expect(view.livesLeft).toBe(3);
    expect(view.ante).toBe(3);
    expect(lockpickActive(USER)).toBe(true);
  });

  test("engaging twice without closing is rejected", () => {
    const box = boxIds(ctx)[0]!;
    engageLockpick(ctx, USER, box, 3);
    expect(engageLockpick(ctx, USER, box, 3)).toBe(false);
  });

  test("engaging an unknown box is rejected", () => {
    expect(engageLockpick(ctx, USER, "not-a-box", 3)).toBe(false);
  });

  test("picking an action outside the ante's allowed set is a no-op", () => {
    const box = boxIds(ctx)[1]!;
    engageLockpick(ctx, USER, box, 1);
    const before = viewOf(ctx)!;
    const disallowed = (["hardSet", "drop"] as const).find((a) => !before.allowedActions.includes(a));
    if (disallowed === undefined) return;
    expect(pickLock(ctx, USER, disallowed)).toBe(false);
    expect(viewOf(ctx)!.col).toBe(before.col);
  });

  test("closing a live session clears it without locking the box out", () => {
    const box = boxIds(ctx)[2]!;
    engageLockpick(ctx, USER, box, 2);
    expect(closeLockpick(ctx, USER)).toBe(true);
    expect(lockpickActive(USER)).toBe(false);
    expect(viewOf(ctx)).toBeUndefined();
    expect(lockboxLockedOut(ctx, box, USER)).toBe(false);
  });

  test("walking the visible solution path to the seat succeeds and grants loot, then locks the box out", () => {
    const box = boxIds(ctx)[0]!;
    const before = ctx.game.economy.balance(USER, COPPER);
    expect(solveSession(ctx, box, 3)).toBe(true);
    expect(ctx.game.economy.balance(USER, COPPER)).toBeGreaterThan(before);
    expect(lockboxLockedOut(ctx, box, USER)).toBe(true);
    expect(engageLockpick(ctx, USER, box, 3)).toBe(false);
  });

  test("premium ante (one life) also resolves off the visible path", () => {
    const box = boxIds(ctx)[1]!;
    expect(solveSession(ctx, box, 1)).toBe(true);
  });
});
