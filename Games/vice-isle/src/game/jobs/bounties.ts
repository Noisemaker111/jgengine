import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import { BOUNTY_CRED, grantCred } from "../progression/cred";
import { BOUNTY_SPOTS, districtAt } from "../world/districts";

export const BOUNTY_UNLOCK_QUEST = "m2_dock_sweep";
export const BOUNTY_COOLDOWN_SEC = 45;
export const BOUNTY_TARGET_PREFIX = "bounty_target_";

export interface BountyState {
  /** Lifetime contracts completed — drives payout escalation and spot rotation. */
  completed: number;
  /** Instance id of the live target, or null between contracts. */
  targetId: string | null;
  /** Spot the live target was staged at (`BOUNTY_SPOTS` id). */
  spotId: string | null;
  /** Game-time (sec) when the next contract may stage. */
  nextAt: number;
}

export const bountyStore = defineStore<BountyState | undefined>("vice.bounty", undefined);

export function bountyPayout(completed: number): number {
  return 350 + Math.min(completed, 8) * 175;
}

/** Round-robin over the authored spots so consecutive contracts always move districts. */
export function bountySpotIndex(completed: number, spotCount: number): number {
  return spotCount <= 0 ? 0 : completed % spotCount;
}

function bountyState(ctx: GameContext): BountyState {
  return bountyStore.read(ctx) ?? { completed: 0, targetId: null, spotId: null, nextAt: 0 };
}

function unlocked(ctx: GameContext): boolean {
  return ctx.game.quest!.list(ctx.player.userId).some((q) => q.questId === BOUNTY_UNLOCK_QUEST && q.status === "completed");
}

/**
 * Stage/settle contracts. The live target is a world entity, so it (and the store) survive the
 * whole-world save; a restore where the target entity is missing just re-arms the cooldown.
 */
export function tickBounties(ctx: GameContext): void {
  if (!unlocked(ctx)) return;
  const state = bountyState(ctx);
  const now = ctx.time.now();

  if (state.targetId !== null) {
    if (ctx.scene.entity.get(state.targetId) !== null) return;
    // Target entity gone without `onBountyKilled` having settled it (restore edge) — re-arm.
    bountyStore.write(ctx, { ...state, targetId: null, spotId: null, nextAt: now + BOUNTY_COOLDOWN_SEC });
    return;
  }

  if (now < state.nextAt) return;
  const spot = BOUNTY_SPOTS[bountySpotIndex(state.completed, BOUNTY_SPOTS.length)];
  if (spot === undefined) return;
  const targetId = `${BOUNTY_TARGET_PREFIX}${state.completed}_${spot.id}`;
  const [x, , z] = spot.position;
  ctx.scene.entity.spawn("bounty_mark", {
    id: targetId,
    position: [x, ctx.world.groundHeightAt(x, z), z],
    role: "npc",
  });
  bountyStore.write(ctx, { ...state, targetId, spotId: spot.id });
  const district = districtAt(x, z)?.label ?? "the streets";
  ctx.game.feed.push("vice.log", { text: `Bounty posted: ${spot.label}, ${district}.` });
}

/** Settle a kill if it was the live bounty target; returns false for unrelated deaths. */
export function onBountyKilled(ctx: GameContext, instanceId: string): boolean {
  const state = bountyState(ctx);
  if (state.targetId === null || instanceId !== state.targetId) return false;
  const payout = bountyPayout(state.completed);
  ctx.game.economy.grant(ctx.player.userId, "cash", payout);
  grantCred(ctx, BOUNTY_CRED);
  bountyStore.write(ctx, {
    completed: state.completed + 1,
    targetId: null,
    spotId: null,
    nextAt: ctx.time.now() + BOUNTY_COOLDOWN_SEC,
  });
  ctx.game.feed.push("vice.log", { text: `Bounty collected — $${payout}.` });
  return true;
}
