import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type DependencyList } from "react";
import { AxisChannel, type AxisChannelConfig } from "@jgengine/core/input/axisInput";
import { createMarkerSet, type MarkerSet } from "@jgengine/core/world/markers";
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
import { gamePhase, setGamePhase, type GamePhase } from "@jgengine/core/game/gamePhase";
import { useGameContext, useOptionalGameContext } from "./provider";

const noopSubscribe = (): (() => void) => () => undefined;
import { createSelectCache, readSelectSnapshot } from "./selectSnapshot";

export function useGameStore<T>(
  selector: (ctx: GameContext) => T,
  isEqual: (previous: T, next: T) => boolean = Object.is,
): T {
  const ctx = useGameContext();
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const isEqualRef = useRef(isEqual);
  isEqualRef.current = isEqual;
  const cacheRef = useRef(createSelectCache<number, T>());

  const getSnapshot = useCallback(
    () =>
      readSelectSnapshot(
        cacheRef.current,
        ctx.version(),
        () => selectorRef.current(ctx),
        (previous, next) => isEqualRef.current(previous, next),
      ),
    [ctx],
  );

  return useSyncExternalStore(ctx.subscribe, getSnapshot, getSnapshot);
}

/** Subscribe to a single keyed slice of the game store, returning `fallback` until the key is set. */
export function useGameStoreValue<T>(key: string, fallback: T): T {
  return useGameStore((ctx) => (ctx.game.store.get(key) as T | undefined) ?? fallback);
}

export function useGame(): { commands: GameContext["game"]["commands"]; events: GameEvents } {
  const ctx = useGameContext();
  return useMemo(() => ({ commands: ctx.game.commands, events: ctx.game.events }), [ctx]);
}

export function usePlayer(): { userId: string; isNew: boolean } {
  const ctx = useGameContext();
  return useMemo(() => ({ userId: ctx.player.userId, isNew: ctx.player.isNew }), [ctx]);
}

/** Live run phase + a setter that also gates the shell's touch controls. `menu`/`paused`/`ended` hide the touch dock; `playing` shows it. */
export function useGamePhase(): { phase: GamePhase; setPhase: (phase: GamePhase) => void } {
  const ctx = useGameContext();
  const phase = useGameStore((c) => gamePhase(c));
  const setPhase = useCallback((next: GamePhase) => setGamePhase(ctx, next), [ctx]);
  return { phase, setPhase };
}

/** Live run phase that degrades to `"playing"` when rendered outside a `GameProvider` (component showcases, previews), so phase-gated chrome never throws. */
export function useOptionalGamePhase(): GamePhase {
  const ctx = useOptionalGameContext();
  const getSnapshot = useCallback(() => (ctx === null ? "playing" : gamePhase(ctx)), [ctx]);
  return useSyncExternalStore(ctx?.subscribe ?? noopSubscribe, getSnapshot, getSnapshot);
}

export function useSceneEntities(): readonly SceneEntity[] {
  return useGameStore((ctx) => ctx.scene.entity.list());
}

export function useSceneObjects(): readonly SceneObject[] {
  return useGameStore((ctx) => ctx.scene.object.list());
}

/**
 * Membership-only entity id list: the returned array keeps a stable identity across per-frame pose
 * writes and only changes when an entity spawns, despawns, or the store is hydrated (#625). A marker
 * mapped from these ids reads its own live pose imperatively (useFrame), so the actor tree no longer
 * re-reconciles every frame. Prefer this over {@link useSceneEntities} for large scenes.
 */
export function useSceneEntityIds(): readonly string[] {
  const ctx = useGameContext();
  const entity = ctx.scene.entity;
  return useSyncExternalStore(entity.subscribeMembership, entity.ids, entity.ids);
}

/** Membership-only object id list — the object counterpart of {@link useSceneEntityIds}; stable across move/rotate/setVisual, changes only on place/remove. */
export function useSceneObjectIds(): readonly string[] {
  const ctx = useGameContext();
  const object = ctx.scene.object;
  return useSyncExternalStore(object.subscribeMembership, object.ids, object.ids);
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

/** Live slots plus `move`/`split` actions bound to `inventoryId`, routed through the notifying `inventory.move`/`inventory.split` commands so React re-renders. */
export interface InventoryGridBinding {
  slots: readonly InventorySlot[];
  move(from: number, to: number): void;
  split(slot: number, amount: number, toSlot?: number): void;
}

/**
 * Binds a live inventory to a HUD grid: `slots` from {@link useInventory}, and `move`/`split` that run
 * the built-in `inventory.move`/`inventory.split` commands (which notify, so the grid re-renders).
 */
export function useInventoryGrid(inventoryId: string): InventoryGridBinding {
  const slots = useInventory(inventoryId);
  const { commands } = useGame();
  const move = useCallback(
    (from: number, to: number) => {
      commands.run("inventory.move", { inventoryId, from, to });
    },
    [commands, inventoryId],
  );
  const split = useCallback(
    (slot: number, amount: number, toSlot?: number) => {
      commands.run("inventory.split", toSlot === undefined ? { inventoryId, slot, amount } : { inventoryId, slot, amount, toSlot });
    },
    [commands, inventoryId],
  );
  return useMemo(() => ({ slots, move, split }), [slots, move, split]);
}

export function useCurrency(currencyId: string): number {
  return useGameStore((ctx) => ctx.game.economy.balance(ctx.player.userId, currencyId));
}

export function useFeed({ action, limit }: { action: string; limit?: number }): FeedEntry[] {
  return useGameStore((ctx) =>
    ctx.game.feed.recent(action, limit === undefined ? undefined : { limit }),
  );
}

const EMPTY_QUESTS: QuestInstance[] = [];

export function useQuestJournal(): QuestInstance[] {
  return useGameStore((ctx) => ctx.game.quest?.list(ctx.player.userId) ?? EMPTY_QUESTS);
}

const EMPTY_FRIENDS: FriendEntry[] = [];
const EMPTY_PARTY: PartyMemberEntry[] = [];
const EMPTY_WORLD_INVITES: WorldInvite[] = [];
const EMPTY_CHAT: ChatMessage[] = [];
const EMPTY_FRIEND_REQUESTS: FriendRequestEntry[] = [];
const EMPTY_PARTY_INVITES: PartyInviteEntry[] = [];
const OFFLINE_PRESENCE: PresenceInfo = { online: false };

export function useFriends(): FriendEntry[] {
  return useGameStore((ctx) => ctx.game.social?.friends.list(ctx.player.userId) ?? EMPTY_FRIENDS);
}

export function useParty(): PartyMemberEntry[] {
  return useGameStore((ctx) => ctx.game.social?.party.list(ctx.player.userId) ?? EMPTY_PARTY);
}

export function usePresence(userId: string): PresenceInfo {
  return useGameStore((ctx) => ctx.game.social?.presence.get(userId) ?? OFFLINE_PRESENCE);
}

export function useWorldInvites(): WorldInvite[] {
  return useGameStore(
    (ctx) => ctx.game.social?.worldInvites.listFor(ctx.player.userId) ?? EMPTY_WORLD_INVITES,
  );
}

export function useChat(channelId: string, options?: { limit?: number }): ChatMessage[] {
  const limit = options?.limit ?? 50;
  return useGameStore(
    (ctx) =>
      ctx.game.chat?.history(channelId, { limit, viewerUserId: ctx.player.userId }) ?? EMPTY_CHAT,
  );
}

export function useFriendRequests(): FriendRequestEntry[] {
  return useGameStore(
    (ctx) => ctx.game.social?.friends.requestsFor(ctx.player.userId) ?? EMPTY_FRIEND_REQUESTS,
  );
}

export function usePartyInvites(): PartyInviteEntry[] {
  return useGameStore(
    (ctx) => ctx.game.social?.party.invitesFor(ctx.player.userId) ?? EMPTY_PARTY_INVITES,
  );
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
  return useGameStore((ctx) => ctx.game.roster?.list(userId ?? ctx.player.userId) ?? EMPTY_ROSTER);
}

const EMPTY_ROSTER: readonly RosterEntry[] = [];

export function useLeaderboard(
  stat: string,
  options: { scope: LeaderboardScope; limit?: number },
): { userId: string; value: number }[] {
  return useGameStore((ctx) => ctx.game.leaderboard?.getTop(stat, options) ?? EMPTY_LEADERBOARD);
}

const EMPTY_LEADERBOARD: { userId: string; value: number }[] = [];

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

export function abilityKitNeedsHeartbeat(kit: AbilityKit, resourceAvailable?: number): boolean {
  for (const slot of kit.snapshot(resourceAvailable)) {
    if (slot.cooldownRemainingMs > 0 || slot.justCast || slot.groupRemainingMs > 0) return true;
  }
  return false;
}

/** True when `meter`'s value/fraction/tier/ready diverge from `previous` — the re-render check `useEventMeter` polls on its heartbeat. */
export function eventMeterNeedsHeartbeat(meter: EventMeter, previous: EventMeterView | null): boolean {
  const next: EventMeterView = {
    value: meter.value(),
    fraction: meter.fraction(),
    tier: meter.tier(),
    ready: meter.ready(),
  };
  if (previous === null) return true;
  return (
    previous.value !== next.value ||
    previous.fraction !== next.fraction ||
    previous.tier !== next.tier ||
    previous.ready !== next.ready
  );
}

function useEngineHeartbeat(intervalMs: number, shouldTick: () => boolean): void {
  const [, setTick] = useState(0);
  const shouldTickRef = useRef(shouldTick);
  shouldTickRef.current = shouldTick;
  useEffect(() => {
    if (intervalMs <= 0 || typeof window === "undefined") return undefined;
    const id = window.setInterval(() => {
      if (shouldTickRef.current()) setTick((current) => current + 1);
    }, intervalMs);
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
  useEngineHeartbeat(options?.intervalMs ?? 80, () => abilityKitNeedsHeartbeat(kit, resourceAvailable));
  return kit.snapshot(resourceAvailable);
}

export function useAbilitySlot(
  kit: AbilityKit,
  slotId: string,
  resourceAvailable?: number,
  options?: AbilitySlotBindingOptions,
): AbilitySlotSnapshot | null {
  useEngineHeartbeat(options?.intervalMs ?? 80, () => abilityKitNeedsHeartbeat(kit, resourceAvailable));
  return kit.state(slotId, resourceAvailable);
}

/** A rendered snapshot of an {@link EventMeter}: current value, fill fraction, active tier, and ready-to-consume flag. */
export interface EventMeterView {
  value: number;
  fraction: number;
  tier: string | null;
  ready: boolean;
}

/**
 * Bind a `createEventMeter` (`@jgengine/core/stats/eventMeter`) heat/streak gauge to a component — the react-render
 * half of the ult/adrenaline and streak/combo meters (`event-meter` capability) that lets a HUD gauge re-render
 * on tick without the game hand-rolling a `useEffect`/`setInterval` heartbeat around `meter.value()`.
 *
 * @capability event-meter-hud render a core event/heat meter's live value, fraction, tier, and ready state in a HUD gauge
 */
export function useEventMeter(meter: EventMeter, options?: AbilitySlotBindingOptions): EventMeterView {
  const previous = useRef<EventMeterView | null>(null);
  useEngineHeartbeat(options?.intervalMs ?? 80, () => {
    const changed = eventMeterNeedsHeartbeat(meter, previous.current);
    if (changed) {
      previous.current = {
        value: meter.value(),
        fraction: meter.fraction(),
        tier: meter.tier(),
        ready: meter.ready(),
      };
    }
    return changed;
  });
  const view = { value: meter.value(), fraction: meter.fraction(), tier: meter.tier(), ready: meter.ready() };
  previous.current = view;
  return view;
}

/**
 * A self-ticking {@link MarkerSet} kept in sync with the live scene: on a
 * heartbeat (default 100ms, and once immediately) it clears the set and calls
 * `rebuild(markers, ctx)` to repopulate it from the current scene, so a HUD map
 * never hand-rolls a `setInterval` + `markers.clear()` + rescan. Each heartbeat
 * also re-renders the calling component, so player-centered props derived from
 * the live scene each tick (`center`, `facingYaw`, zone name) stay fresh — this
 * fully subsumes the hand-rolled ticker, not just the marker rebuild. The set is
 * stable across renders and re-seeded whenever `ctx`, `intervalMs`, or the
 * supplied `deps` change. SSR-safe: the heartbeat only arms when `window` is
 * available.
 *
 * @capability live-markers a self-ticking MarkerSet kept in sync from the live scene each HUD tick — pass a rebuild(markers, ctx) that clears+repopulates, no hand-rolled setInterval
 */
export function useLiveMarkers(
  rebuild: (markers: MarkerSet, ctx: GameContext) => void,
  options?: { intervalMs?: number; deps?: DependencyList },
): MarkerSet {
  const ctx = useGameContext();
  const markers = useMemo(() => createMarkerSet(() => ctx.time.now()), [ctx]);
  const rebuildRef = useRef(rebuild);
  rebuildRef.current = rebuild;
  const intervalMs = options?.intervalMs ?? 100;
  const deps = options?.deps ?? [];
  const [, forceTick] = useState(0);
  useEffect(() => {
    const run = (): void => {
      markers.clear();
      rebuildRef.current(markers, ctx);
      forceTick((value) => (value + 1) % 1_000_000);
    };
    run();
    if (intervalMs <= 0 || typeof window === "undefined") return undefined;
    const id = window.setInterval(run, intervalMs);
    return () => window.clearInterval(id);
    // deps is spread so callers can re-seed on their own inputs.
  }, [markers, ctx, intervalMs, ...deps]);
  return markers;
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

/**
 * Re-render at a steady rate. Returns a monotonically increasing tick count driven by a
 * setInterval, for HUD elements that display wall-clock-derived values (cooldowns, cast bars,
 * swing timers) without an engine subscription to hang off. `hz <= 0` disables the ticker.
 *
 * @capability hud-ticker re-render a HUD element at a steady hz for time-derived readouts (cooldowns, cast/swing bars) — no hand-rolled setInterval effects
 */
export function useTicker(hz = 10): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!Number.isFinite(hz) || hz <= 0) return undefined;
    const timer = setInterval(() => setTick((value) => value + 1), 1000 / hz);
    return () => clearInterval(timer);
  }, [hz]);
  return tick;
}

/** Minimal add/removeEventListener surface accepted by useDomEvent (window, document, elements). */
export interface DomEventTarget {
  addEventListener(type: string, listener: (event: never) => void, options?: unknown): void;
  removeEventListener(type: string, listener: (event: never) => void, options?: unknown): void;
}

/**
 * Attach a DOM event listener with automatic cleanup. `resolveTarget` runs inside the effect, so
 * `() => window` and ref-reading resolvers are SSR-safe; return null to skip attaching. The
 * handler is kept in a ref, so a fresh closure per render never re-binds the listener.
 * Re-binds only when `type` or `options.capture`/`options.passive` change.
 *
 * @capability dom-event attach a window/document/element event listener with automatic cleanup and a stable handler ref — no hand-rolled addEventListener effects
 */
export function useDomEvent<E>(
  resolveTarget: () => DomEventTarget | null,
  type: string,
  handler: (event: E) => void,
  options?: { capture?: boolean; passive?: boolean },
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const capture = options?.capture ?? false;
  const passive = options?.passive;
  useEffect(() => {
    const target = resolveTarget();
    if (target === null) return undefined;
    const listener = (event: E) => handlerRef.current(event);
    const listenerOptions = passive === undefined ? { capture } : { capture, passive };
    target.addEventListener(type, listener as (event: never) => void, listenerOptions);
    return () => target.removeEventListener(type, listener as (event: never) => void, listenerOptions);
    // resolveTarget is intentionally excluded: it is expected to be an inline closure over a
    // stable target (window, document, a ref) and re-running on its identity would re-bind
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, capture, passive]);
}

/**
 * Run a requestAnimationFrame loop while `active`, calling `onFrame(deltaSeconds)` each frame.
 * The callback is kept in a ref so re-renders never restart the loop; cleanup cancels the
 * pending frame. For scene-graph work inside a canvas prefer R3F's useFrame — this is for
 * DOM-side animation outside the renderer.
 *
 * @capability raf-loop run a cancellable requestAnimationFrame loop for DOM-side animation with delta seconds — no hand-rolled RAF effects
 */
export function useRafLoop(onFrame: (deltaSeconds: number) => void, active = true): void {
  const frameRef = useRef(onFrame);
  frameRef.current = onFrame;
  useEffect(() => {
    if (!active || typeof requestAnimationFrame !== "function") return undefined;
    let handle = 0;
    let last = performance.now();
    const step = (now: number) => {
      frameRef.current(Math.max(0, now - last) / 1000);
      last = now;
      handle = requestAnimationFrame(step);
    };
    handle = requestAnimationFrame(step);
    return () => cancelAnimationFrame(handle);
  }, [active]);
}

/**
 * Pin a scrollable element to its bottom whenever `dep` changes (typically a length or the list
 * itself). Attach the returned ref to the scroll container. Owns the log/chat/console
 * scroll-to-bottom effect so panels don't hand-roll it.
 *
 * @capability auto-scroll pin a log/chat/console panel to its newest line as entries arrive — no hand-rolled scrollTop effects
 */
export function useAutoScroll<T extends HTMLElement>(dep: unknown) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (node !== null) node.scrollTop = node.scrollHeight;
  }, [dep]);
  return ref;
}
