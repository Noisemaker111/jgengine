import { useMemo, useSyncExternalStore } from "react";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { GameEvents } from "@jgengine/core/game/events";
import type { FeedEntry } from "@jgengine/core/game/feed";
import type { QuestInstance } from "@jgengine/core/game/quest";
import type { FriendEntry, PartyMemberEntry, PresenceInfo } from "@jgengine/core/game/social";
import type { LeaderboardScope } from "@jgengine/core/game/leaderboard";
import type { InventorySlot } from "@jgengine/core/inventory/inventoryModel";
import type { StatValue } from "@jgengine/core/scene/entityStats";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import type { WorldItemRecord } from "@jgengine/core/game/worldItem";
import type { ClockSnapshot, SimClock } from "@jgengine/core/time/simClock";
import {
  resolveActivePrompt,
  type PositionedPrompt,
} from "@jgengine/core/interaction/proximityPrompt";
import { useGameContext } from "./provider";

export function useGameStore<T>(selector: (ctx: GameContext) => T): T {
  const ctx = useGameContext();
  useSyncExternalStore(ctx.subscribe, ctx.version, ctx.version);
  return selector(ctx);
}

export function useGame(): { commands: GameContext["game"]["commands"]; events: GameEvents } {
  const ctx = useGameContext();
  return useMemo(() => ({ commands: ctx.game.commands, events: ctx.game.events }), [ctx]);
}

export function usePlayer(): { userId: string; isNew: boolean } {
  const ctx = useGameContext();
  return useMemo(() => ({ userId: ctx.player.userId, isNew: ctx.player.isNew }), [ctx]);
}

export function useSceneEntities(): readonly SceneEntity[] {
  return useGameStore((ctx) => ctx.scene.entity.list());
}

export function useSceneObjects(): readonly SceneObject[] {
  return useGameStore((ctx) => ctx.scene.object.list());
}

export function useWorldItems(): readonly WorldItemRecord[] {
  return useGameStore((ctx) => ctx.scene.worldItem.list());
}

/** Nearest ground item within `radius` of the local player — drives a pickup prompt/highlight. */
export function useNearestWorldItem(radius: number): WorldItemRecord | null {
  return useGameStore((ctx) => {
    const player = localPlayerEntity(ctx);
    if (player === null) return null;
    const instanceId = ctx.scene.worldItem.nearestInRadius(player.position, radius);
    return instanceId === null ? null : ctx.scene.worldItem.get(instanceId);
  });
}

export function useEntityStat(instanceId: string, statId: string): StatValue | null {
  return useGameStore((ctx) => ctx.scene.entity.stats.get(instanceId, statId));
}

export function useTarget(fromInstanceId: string): string | null {
  return useGameStore((ctx) => ctx.scene.entity.getTarget(fromInstanceId));
}

export function useInventory(inventoryId: string): readonly InventorySlot[] {
  return useGameStore((ctx) => ctx.player.inventory.state(inventoryId).slots);
}

export function useCurrency(currencyId: string): number {
  return useGameStore((ctx) => ctx.game.economy.balance(ctx.player.userId, currencyId));
}

export function useFeed({ action, limit }: { action: string; limit?: number }): FeedEntry[] {
  return useGameStore((ctx) =>
    ctx.game.feed.recent(action, limit === undefined ? undefined : { limit }),
  );
}

export function useQuestJournal(): QuestInstance[] {
  return useGameStore((ctx) => ctx.game.quest.list(ctx.player.userId));
}

export function useFriends(): FriendEntry[] {
  return useGameStore((ctx) => ctx.game.social.friends.list(ctx.player.userId));
}

export function useParty(): PartyMemberEntry[] {
  return useGameStore((ctx) => ctx.game.social.party.list(ctx.player.userId));
}

export function usePresence(userId: string): PresenceInfo {
  return useGameStore((ctx) => ctx.game.social.presence.get(userId));
}

export function useLeaderboard(
  stat: string,
  options: { scope: LeaderboardScope; limit?: number },
): { userId: string; value: number }[] {
  return useGameStore((ctx) => ctx.game.leaderboard.getTop(stat, options));
}

export function useLocalPlayerDead(healthStatId = "health"): boolean {
  return useGameStore((ctx) => {
    const player = localPlayerEntity(ctx);
    if (player === null) return false;
    const health = ctx.scene.entity.stats.get(player.id, healthStatId);
    return health !== null && health.current <= health.min;
  });
}

export function localPlayerEntity(ctx: GameContext): SceneEntity | null {
  return (
    ctx.scene.entity.get(ctx.player.userId) ??
    ctx.scene.entity.list().find((entity) => entity.role === "player") ??
    null
  );
}

export function useGameClock(): ClockSnapshot & { controls: SimClock } {
  const ctx = useGameContext();
  useSyncExternalStore(ctx.subscribe, ctx.version, ctx.version);
  return { ...ctx.time.snapshot(), controls: ctx.time };
}

export function useActivePrompt<T extends PositionedPrompt>(prompts?: readonly T[]): T | null {
  return useGameStore((ctx) => {
    if (prompts === undefined || prompts.length === 0) return null;
    const player = localPlayerEntity(ctx);
    if (player === null) return null;
    return resolveActivePrompt({ x: player.position[0], z: player.position[2] }, prompts);
  });
}
