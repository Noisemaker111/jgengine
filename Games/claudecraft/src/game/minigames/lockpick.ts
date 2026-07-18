import {
  generateLock,
  LOCK_ACTIONS,
  stepLock,
  visibleCells,
  type LockAction,
  type LockCell,
  type LockSpec,
  type LockStepResult,
  type LockTierSpec,
} from "@jgengine/core/interaction/lockpick";
import { command, keybind, proximityPrompt, type PositionedPrompt } from "@jgengine/core/interaction/proximityPrompt";
import { seededRng } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { COPPER } from "../model";
import { ZONES } from "../world/zones";

export const LOCKBOX_CATALOG = "claudecraft_lockbox";
export const LOCKBOX_RADIUS = 4;
export const LOCKOUT_SEC = 600;

export type LockAnte = 1 | 2 | 3;

/** Difficulty scales with ante: 1 (premium, one life) is the tightest board, 3 (modest, three
 * lives) is the most forgiving. Loot tier is the inverse — a low ante trades a wider margin for
 * weaker rewards. */
const ANTE_TIER: Readonly<Record<LockAnte, LockTierSpec>> = {
  1: { cols: 16, rows: 7, width: 1, gateCount: 4, visibilityWindow: 3, allowedActions: ["set", "steady", "ease"], trapCount: 3 },
  2: { cols: 13, rows: 6, width: 1, gateCount: 3, visibilityWindow: 6, allowedActions: LOCK_ACTIONS, trapCount: 1 },
  3: { cols: 10, rows: 6, width: 2, gateCount: 1, visibilityWindow: 10, allowedActions: LOCK_ACTIONS },
};

const ANTE_LIVES: Readonly<Record<LockAnte, number>> = { 1: 1, 2: 2, 3: 3 };

interface LootBand {
  copper: readonly [number, number];
  materialItemId: string;
  materialCount: readonly [number, number];
}

const ANTE_LOOT: Readonly<Record<LockAnte, LootBand>> = {
  1: { copper: [80, 140], materialItemId: "arcane_shard", materialCount: [1, 2] },
  2: { copper: [40, 70], materialItemId: "arcane_essence", materialCount: [1, 2] },
  3: { copper: [15, 30], materialItemId: "arcane_dust", materialCount: [2, 4] },
};

export interface LockboxView {
  ante: LockAnte;
  livesLeft: number;
  col: number;
  row: number;
  cols: number;
  rows: number;
  visible: readonly LockCell[];
  allowedActions: readonly LockAction[];
  result: "playing" | "success" | "failed";
  lastStep: LockStepResult | null;
}

interface LockSession {
  instanceId: string;
  ante: LockAnte;
  spec: LockSpec;
  col: number;
  row: number;
  livesLeft: number;
  result: "playing" | "success" | "failed";
  lastStep: LockStepResult | null;
}

const sessions = new Map<string, LockSession>();
const boxes = new Map<string, readonly [number, number, number]>();
const lockRoll = seededRng("claudecraft-lockpick-loot");

function lockoutKey(instanceId: string, userId: string): string {
  return `lockbox:${instanceId}:${userId}`;
}

function viewKey(userId: string): string {
  return `lockpick:${userId}`;
}

export function placeLockboxes(ctx: GameContext): number {
  boxes.clear();
  let placed = 0;
  for (const zone of ZONES) {
    const x = zone.hub.x + 22;
    const z = zone.hub.z - 16;
    const y = ctx.world.groundHeightAt(x, z);
    const instanceId = ctx.scene.object.place(LOCKBOX_CATALOG, x, y, z);
    boxes.set(instanceId, [x, y, z]);
    placed += 1;
  }
  return placed;
}

export function lockboxLockedOut(ctx: GameContext, instanceId: string, userId: string): boolean {
  const expiry = (ctx.game.store.get(lockoutKey(instanceId, userId)) as number | undefined) ?? 0;
  return ctx.time.now() < expiry;
}

export function lockboxPrompts(ctx: GameContext): readonly PositionedPrompt[] {
  const userId = ctx.player.userId;
  const prompts: PositionedPrompt[] = [];
  for (const [instanceId, position] of boxes) {
    if (lockboxLockedOut(ctx, instanceId, userId)) continue;
    prompts.push({
      id: `lockbox:${instanceId}`,
      position: { x: position[0], z: position[2] },
      prompt: proximityPrompt({
        radius: LOCKBOX_RADIUS,
        display: keybind("interact"),
        invoke: command("lockpick.engage", { instanceId }),
      }),
    });
  }
  return prompts;
}

/** Begin a lockpick session against a world lockbox at the given ante (default: medium). Denies
 * (no side effect) if the player already has a live session, the box is unknown, or it's still
 * locked out from a prior success/failure at this box. */
export function engageLockpick(ctx: GameContext, userId: string, instanceId: string, ante: LockAnte = 2): boolean {
  if (sessions.has(userId)) return false;
  if (!boxes.has(instanceId)) return false;
  if (lockboxLockedOut(ctx, instanceId, userId)) {
    ctx.scene.entity.floatText({ instanceId: userId, text: "This lock won't budge yet", kind: "info" });
    return false;
  }
  const tier = ANTE_TIER[ante];
  const seed = `${instanceId}:${userId}:${Math.floor(ctx.time.now() * 1000)}`;
  const spec = generateLock(seed, tier);
  sessions.set(userId, {
    instanceId,
    ante,
    spec,
    col: 0,
    row: spec.startRow,
    livesLeft: ANTE_LIVES[ante],
    result: "playing",
    lastStep: null,
  });
  sync(ctx, userId);
  return true;
}

/** One pick action against the player's live session. Returns false if there is no live session
 * or the action isn't allowed at this difficulty. */
export function pickLock(ctx: GameContext, userId: string, action: LockAction): boolean {
  const session = sessions.get(userId);
  if (session === undefined || session.result !== "playing") return false;
  if (!session.spec.tier.allowedActions.includes(action)) return false;
  const step = stepLock(session.spec, session.col, session.row, action);
  session.col = step.col;
  session.row = step.row;
  session.lastStep = step.result;
  if (step.result === "slip" || step.result === "bind" || step.result === "trap") {
    session.livesLeft -= 1;
    if (session.livesLeft <= 0) {
      session.result = "failed";
      lockOut(ctx, session, userId);
      ctx.scene.entity.floatText({ instanceId: userId, text: "The lock jams shut", kind: "info" });
    }
  } else if (step.result === "success") {
    session.result = "success";
    grantLoot(ctx, userId, session.ante);
    lockOut(ctx, session, userId);
    ctx.scene.entity.floatText({ instanceId: userId, text: "The lock clicks open!", kind: "info" });
  }
  sync(ctx, userId);
  return true;
}

/** Leave a live session without resolving it. Unlike success/failure, abandoning does not lock
 * the box out — nothing was wagered, so an interrupted attempt can simply be retried. */
export function closeLockpick(ctx: GameContext, userId: string): boolean {
  const had = sessions.delete(userId);
  ctx.game.store.delete(viewKey(userId));
  return had;
}

export function lockpickActive(userId: string): boolean {
  return sessions.has(userId);
}

/** The live session's full lock board, for solvers/tests. Never exposed to the client view
 * (`LockboxView` only ever carries the fogged `visible` slice). */
export function lockSessionSpec(userId: string): LockSpec | null {
  return sessions.get(userId)?.spec ?? null;
}

function lockOut(ctx: GameContext, session: LockSession, userId: string): void {
  ctx.game.store.set(lockoutKey(session.instanceId, userId), ctx.time.now() + LOCKOUT_SEC);
}

function grantLoot(ctx: GameContext, userId: string, ante: LockAnte): void {
  const loot = ANTE_LOOT[ante];
  const copper = loot.copper[0] + Math.floor(lockRoll() * (loot.copper[1] - loot.copper[0] + 1));
  const materialCount =
    loot.materialCount[0] + Math.floor(lockRoll() * (loot.materialCount[1] - loot.materialCount[0] + 1));
  ctx.game.economy.grant(userId, COPPER, copper);
  ctx.player.inventory.put("bags", loot.materialItemId, materialCount);
}

function sync(ctx: GameContext, userId: string): void {
  const session = sessions.get(userId);
  if (session === undefined) {
    ctx.game.store.delete(viewKey(userId));
    return;
  }
  const view: LockboxView = {
    ante: session.ante,
    livesLeft: session.livesLeft,
    col: session.col,
    row: session.row,
    cols: session.spec.tier.cols,
    rows: session.spec.tier.rows,
    visible: visibleCells(session.spec, session.col, session.spec.tier.visibilityWindow),
    allowedActions: session.spec.tier.allowedActions,
    result: session.result,
    lastStep: session.lastStep,
  };
  ctx.game.store.set(viewKey(userId), view);
  if (session.result !== "playing") sessions.delete(userId);
}

export function lockboxCount(): number {
  return boxes.size;
}
