import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { AbilityKit, AbilitySlotSnapshot } from "@jgengine/core/combat/abilityKit";
import type { EventMeter } from "@jgengine/core/stats/eventMeter";
import type { GameEvents } from "@jgengine/core/game/events";
import type { FeedEntry } from "@jgengine/core/game/feed";
import type { QuestInstance } from "@jgengine/core/game/quest";
import type { ChatMessage } from "@jgengine/core/game/chat";
import type { FriendEntry, PartyMemberEntry, PresenceInfo, WorldInvite } from "@jgengine/core/game/social";
import type { LeaderboardScope } from "@jgengine/core/game/leaderboard";
import type { InventorySlot } from "@jgengine/core/inventory/inventoryModel";
import type { StatValue } from "@jgengine/core/scene/entityStats";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import type { RosterEntry } from "@jgengine/core/scene/roster";
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

export function useGameState<T>(id: string): T | undefined {
  return useGameStore((ctx) => ctx.game.state.get<T>(id));
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

export function useWorldInvites(): WorldInvite[] {
  return useGameStore((ctx) => ctx.game.social.worldInvites.listFor(ctx.player.userId));
}

export function useChat(channelId: string, options?: { limit?: number }): ChatMessage[] {
  const limit = options?.limit ?? 50;
  return useGameStore((ctx) =>
    ctx.game.chat.history(channelId, { limit, viewerUserId: ctx.player.userId }),
  );
}

export function useRoster(userId?: string): readonly RosterEntry[] {
  return useGameStore((ctx) => ctx.game.roster.list(userId ?? ctx.player.userId));
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

function useEngineHeartbeat(intervalMs: number): void {
  const ctx = useGameContext();
  useSyncExternalStore(ctx.subscribe, ctx.version, ctx.version);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (intervalMs <= 0 || typeof window === "undefined") return undefined;
    const id = window.setInterval(() => setTick((current) => current + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
}

export interface AbilitySlotBindingOptions {
  intervalMs?: number;
}

export function useAbilitySlots(
  kit: AbilityKit,
  resourceAvailable?: number,
  options?: AbilitySlotBindingOptions,
): AbilitySlotSnapshot[] {
  useEngineHeartbeat(options?.intervalMs ?? 80);
  return kit.snapshot(resourceAvailable);
}

export function useAbilitySlot(
  kit: AbilityKit,
  slotId: string,
  resourceAvailable?: number,
  options?: AbilitySlotBindingOptions,
): AbilitySlotSnapshot | null {
  useEngineHeartbeat(options?.intervalMs ?? 80);
  return kit.state(slotId, resourceAvailable);
}

export interface EventMeterView {
  value: number;
  fraction: number;
  tier: string | null;
  ready: boolean;
}

export function useEventMeter(meter: EventMeter, options?: AbilitySlotBindingOptions): EventMeterView {
  useEngineHeartbeat(options?.intervalMs ?? 80);
  return { value: meter.value(), fraction: meter.fraction(), tier: meter.tier(), ready: meter.ready() };
}
