import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AxisChannel, type AxisChannelConfig } from "@jgengine/core/input/axisInput";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { AbilityKit, AbilitySlotSnapshot } from "@jgengine/core/combat/abilityKit";
import type { EventMeter } from "@jgengine/core/stats/eventMeter";
import type { GameEvents } from "@jgengine/core/game/events";
import type { FeedEntry } from "@jgengine/core/game/feed";
import type { QuestInstance } from "@jgengine/core/game/quest";
import type { ChatMessage } from "@jgengine/core/game/chat";
import type {
  FriendEntry,
  FriendRequestEntry,
  PartyInviteEntry,
  PartyMemberEntry,
  PresenceInfo,
  WorldInvite,
} from "@jgengine/core/game/social";
import {
  browseSessions,
  type MatchFilter,
  type SessionListing,
} from "@jgengine/core/multiplayer/matchmaking";
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

export function useFriendRequests(): FriendRequestEntry[] {
  return useGameStore((ctx) => ctx.game.social.friends.requestsFor(ctx.player.userId));
}

export function usePartyInvites(): PartyInviteEntry[] {
  return useGameStore((ctx) => ctx.game.social.party.invitesFor(ctx.player.userId));
}

export interface WorldBrowserState {
  listings: SessionListing[];
  loading: boolean;
  error: string | null;
  refresh(): void;
}

/**
 * Polls a host-supplied session fetcher (e.g. createWsBackend().browse) and
 * filters through matchmaking's browseSessions. fetchSessions must be
 * identity-stable (wrap in useCallback at the call site) or every render
 * refetches.
 */
export function useWorldBrowser(options: {
  fetchSessions: () => Promise<readonly SessionListing[]>;
  filter?: MatchFilter;
  limit?: number;
  refreshMs?: number;
}): WorldBrowserState {
  const { fetchSessions, refreshMs } = options;
  const [raw, setRaw] = useState<readonly SessionListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSessions()
      .then((listings) => {
        if (cancelled) return;
        setRaw(listings);
        setError(null);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "failed to browse sessions");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchSessions, refreshTick]);

  useEffect(() => {
    if (refreshMs === undefined || refreshMs <= 0) return undefined;
    const id = setInterval(() => setRefreshTick((tick) => tick + 1), refreshMs);
    return () => clearInterval(id);
  }, [refreshMs]);

  const filter = options.filter;
  const limit = options.limit;
  const listings = useMemo(
    () => browseSessions(raw, filter, limit === undefined ? {} : { limit }),
    [raw, filter, limit],
  );

  return useMemo(
    () => ({ listings, loading, error, refresh: () => setRefreshTick((tick) => tick + 1) }),
    [listings, loading, error],
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

type HeldKeyEventTarget = Pick<Window, "addEventListener" | "removeEventListener">;

export function createHeldKeyTracker(target: HeldKeyEventTarget): {
  isDown: (code: string) => boolean;
  dispose: () => void;
} {
  const held = new Set<string>();
  const onKeyDown = (event: KeyboardEvent) => held.add(event.code);
  const onKeyUp = (event: KeyboardEvent) => held.delete(event.code);
  const onBlur = () => held.clear();
  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", onBlur);
  return {
    isDown: (code) => held.has(code),
    dispose: () => {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", onBlur);
      held.clear();
    },
  };
}

/**
 * Held-key predicate backed by window keydown/keyup/blur listeners (blur clears held state so a
 * released-off-window key doesn't stick). SSR-safe: listeners attach in an effect, never at module
 * scope. The returned predicate is stable across renders.
 */
export function useHeldKeys(): (code: string) => boolean {
  const trackerRef = useRef<ReturnType<typeof createHeldKeyTracker> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const tracker = createHeldKeyTracker(window);
    trackerRef.current = tracker;
    return () => {
      tracker.dispose();
      trackerRef.current = null;
    };
  }, []);

  return useCallback((code: string) => trackerRef.current?.isDown(code) ?? false, []);
}

export interface UseAxisChannelResult {
  channel: AxisChannel;
  isDown: (code: string) => boolean;
}

/**
 * Wires useHeldKeys into a fresh AxisChannel, ready for a per-frame `channel.sample(dt, isDown)`.
 * The channel is recreated when `config` identity changes, so pass a stable config (useMemo/module
 * constant at the call site) unless a rebind is intended.
 */
export function useAxisChannel(config: AxisChannelConfig): UseAxisChannelResult {
  const isDown = useHeldKeys();
  const channel = useMemo(() => new AxisChannel(config), [config]);
  return { channel, isDown };
}
