import {
  type ActionStateTracker,
  createActionRepeater,
  hotbarSlotActionIndex,
  resolveActionCommand,
} from "@jgengine/core/input/actionBindings";
import { resolveActivePrompt } from "@jgengine/core/interaction/proximityPrompt";
import { aimToPoint } from "@jgengine/core/input/pointer";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { Aim } from "@jgengine/core/scene/spatial";

import type { PointerService } from "./pointer/pointerService";
import type { PlayableGame } from "./registry";

export const RESERVED_INPUT_ACTIONS: ReadonlySet<string> = new Set([
  "moveForward",
  "moveBack",
  "moveLeft",
  "moveRight",
  "turnLeft",
  "turnRight",
  "sprint",
  "jump",
  "tabTarget",
  "clearTarget",
  "useAbility",
  "interact",
]);

export function findHotbarSlotActions(input: PlayableGame["game"]["input"]): { action: string; slot: number }[] {
  return Object.keys(input ?? {}).flatMap((action) => {
    const slot = hotbarSlotActionIndex(action);
    return slot === null ? [] : [{ action, slot }];
  });
}

export function hotbarIdFor(playable: PlayableGame): string | null {
  const declarations = Object.entries(playable.game.inventories ?? {});
  const hud = declarations.find(([, declaration]) => declaration.hud === "hotbar");
  return (hud ?? declarations[0])?.[0] ?? null;
}

export function executeHotbarSlot(
  ctx: GameContext,
  fromId: string,
  hotbarId: string,
  slot: number,
  yaw: number,
  pitch: number,
  aimOverride?: Aim,
): { ok: boolean; error?: string } {
  const stack = ctx.player.inventory.state(hotbarId).slots[slot];
  if (stack === undefined || stack === null) return { ok: false, error: `Hotbar slot ${slot + 1} is empty` };
  const result = ctx.item.use.use({
    from: fromId,
    itemId: stack.itemId,
    inventoryId: hotbarId,
    aim: aimOverride ?? { yaw, pitch },
  });
  return result.error === undefined ? { ok: true } : { ok: false, error: result.error };
}

export function pointerAimFor(ctx: GameContext, service: PointerService): Aim | undefined {
  const hit = service.worldHit();
  if (hit === null) return undefined;
  const player = ctx.scene.entity.get(ctx.player.userId);
  const origin = player === null ? hit.point : player.position;
  return aimToPoint([origin[0], origin[1] + 1, origin[2]], hit.point);
}

export interface DispatchFrameActionsArgs {
  ctx: GameContext;
  playable: PlayableGame;
  tracker: ActionStateTracker<string>;
  playerId: string;
  declaredActions: readonly string[];
  repeatIntervals: Record<string, number>;
  actionRepeater: ReturnType<typeof createActionRepeater>;
  slotActions: readonly { action: string; slot: number }[];
  hotbarId: string | null;
  aim: { yaw: number; pitch: number };
  pingCommand: string | undefined;
  pointerService: PointerService | null;
  pointerAim: boolean;
}

export function dispatchFrameActions({
  ctx,
  playable,
  tracker,
  playerId,
  declaredActions,
  repeatIntervals,
  actionRepeater,
  slotActions,
  hotbarId,
  aim,
  pingCommand,
  pointerService,
  pointerAim,
}: DispatchFrameActionsArgs): { aimOverride: Aim | undefined } {
  if (tracker.wasPressed("tabTarget")) {
    if (ctx.game.commands.has("target.cycle")) ctx.game.commands.run("target.cycle", {});
    else ctx.scene.entity.cycleTarget(playerId, { filter: "hostile" });
  }
  if (tracker.wasPressed("clearTarget")) {
    if (ctx.game.commands.has("target.clear")) ctx.game.commands.run("target.clear", {});
    else ctx.scene.entity.setTarget(playerId, null);
  }
  if (pingCommand !== undefined && pointerService !== null && tracker.wasPressed("ping")) {
    const hit = pointerService.worldHit();
    if (hit !== null && ctx.game.commands.has(pingCommand)) {
      ctx.game.commands.run(pingCommand, {
        point: hit.point,
        entity: hit.entity,
        object: hit.object,
        normal: hit.normal,
      });
    }
  }
  const nowMs = performance.now();
  for (const action of declaredActions) {
    const due =
      repeatIntervals[action] === undefined
        ? tracker.wasPressed(action)
        : actionRepeater.due(action, tracker.isDown(action), tracker.wasPressed(action), nowMs);
    if (!due) continue;
    if (action === "ping" && pingCommand !== undefined) continue;
    if (action === "interact") {
      const prompts = playable.prompts?.(ctx);
      const focus = prompts === undefined ? null : ctx.scene.entity.get(playerId);
      if (prompts !== undefined && focus !== null) {
        const active = resolveActivePrompt({ x: focus.position[0], z: focus.position[2] }, prompts);
        if (active !== null && active.prompt.invoke !== null) {
          ctx.game.commands.run(active.prompt.invoke.name, active.prompt.invoke.input);
        }
      }
      continue;
    }
    const command = resolveActionCommand(action, (name) => ctx.game.commands.has(name), RESERVED_INPUT_ACTIONS);
    if (command !== null) {
      ctx.game.commands.run(command, { aim });
    }
  }

  let aimOverride: Aim | undefined;
  if (hotbarId !== null) {
    aimOverride = pointerAim && pointerService !== null ? pointerAimFor(ctx, pointerService) : undefined;
    for (const { action, slot } of slotActions) {
      if (!tracker.wasPressed(action)) continue;
      const result = executeHotbarSlot(ctx, playerId, hotbarId, slot, aim.yaw, aim.pitch, aimOverride);
      if (!result.ok) console.warn(`[jgengine:item-use] ${result.error}`);
    }
  }
  return { aimOverride };
}
