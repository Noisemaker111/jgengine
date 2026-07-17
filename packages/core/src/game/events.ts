import type { DeathReason } from "../combat/deathReason";
import type { TelegraphShape } from "../combat/telegraph";
import type { CameraShake } from "../combat/hitReaction";
import type { CombatVfxInstanceEvent } from "./vfxInstance";

export type { DeathReason };

export interface EntityDiedEvent {
  instanceId: string;
  catalogId: string;
  userId?: string;
  displayName?: string;
  reason: DeathReason;
  position: [number, number, number];
  serverId?: string;
}

/** Request that an entity's rig play a one-shot animation clip bound to `event` in its `animation.oneShots` (e.g. an "attack" swing); the shell resolves the clip and plays it once over the locomotion state. */
export interface EntityAnimationEvent {
  instanceId: string;
  event: string;
}

export interface LootGrantedEvent {
  userId: string;
  drops: { item?: string; currency?: string; count: number }[];
  source?: string;
}

export interface InventoryAddedEvent {
  userId: string;
  item: string;
  count: number;
  source?: string;
}

export interface QuestAcceptedEvent {
  userId: string;
  questId: string;
}

export interface QuestUpdatedEvent {
  userId: string;
  questId: string;
  objectiveId?: string;
  progress?: number;
}

export interface QuestCompletedEvent {
  userId: string;
  questId: string;
}

export interface SocialFriendAddedEvent {
  userId: string;
  friendUserId: string;
}

export interface SocialPartyJoinedEvent {
  userId: string;
  partyId: string;
}

export interface SocialPartyLeftEvent {
  userId: string;
  partyId: string;
}

export interface SocialWorldInvitedEvent {
  inviteId: string;
  fromUserId: string;
  toUserId: string;
  serverId: string;
  joinCode?: string;
}

export interface SocialWorldAcceptedEvent {
  inviteId: string;
  userId: string;
  fromUserId: string;
  serverId: string;
  joinCode?: string;
}

export interface ChatMessageEvent {
  id: string;
  channelId: string;
  fromUserId: string;
  body: string;
  at: number;
  recipients?: readonly string[];
}

export interface StatLevelUpEvent {
  userId: string;
  stat: string;
  level: number;
}

export interface EntityFloatTextEvent {
  instanceId?: string;
  position: [number, number, number];
  text: string;
  kind: string;
  amount?: number;
  hitType?: string;
  element?: string;
  crit?: boolean;
  scale?: number;
}

/** The visual archetype of a spell/ability effect burst: a traveling bolt, a connecting beam, an expanding ground nova, a soft aura glow, or a scattering impact spark. */
export type VfxKind = "projectile" | "beam" | "nova" | "glow" | "spark";

/** A transient sprite-particle effect the shell renders once and expires — one burst of `kind`, tinted `color`, anchored at `from` (and `to` for travel/beam effects). */
export interface CombatVfxEvent {
  id: number;
  kind: VfxKind;
  color: number;
  from: [number, number, number];
  to?: [number, number, number];
  radius?: number;
  durationMs: number;
}

/**
 * An endpoint of a retained VFX instance: either an entity instance id (a renderer resolves and follows its live
 * pose each frame) or a fixed `[x, y, z]` world point. Kept serializable so the effect replicates as plain data.
 */
export type VfxRef = string | readonly [number, number, number];

/**
 * The archetype of a retained (long-lived, updatable) VFX effect — an open string, not a closed union, so a
 * renderer registers new kinds (beam, tether, zone, target line, looping emitter) without a central branch.
 * `"beam"` is the first shipped retained renderer.
 */
export type RetainedVfxKind = string;

export interface CombatTelegraphEvent {
  id: number;
  shape: TelegraphShape;
  position: [number, number, number];
  dir?: number;
  windupMs: number;
  kind: string;
}

export interface CombatTelegraphCancelledEvent {
  /** The `combat.telegraph` event id whose decal should disappear early. */
  id: number;
}

export interface CombatHitReactionEvent {
  instanceId?: string;
  position: [number, number, number];
  hitstopMs: number;
  shake?: CameraShake;
  /** Trauma (0..1) for a trauma² shake channel — set when the reaction resolved from `trauma` instead of `shake`. */
  trauma?: number;
}

export interface ProjectileSettledEvent {
  from: string;
  origin: [number, number, number];
  at: [number, number, number];
  effect: string;
  hit: boolean;
}

export interface WorldItemDroppedEvent {
  instanceId: string;
  itemId: string;
  rarity: string;
  count: number;
  position: [number, number, number];
  source?: string;
}

export interface WorldItemPickedUpEvent {
  instanceId: string;
  userId: string;
  itemId: string;
  rarity: string;
  count: number;
}

export interface CosmeticsChangedEvent {
  userId: string;
  slots: Record<string, string>;
}

export interface EmotePlayedEvent {
  from: string;
  emoteId: string;
  at: readonly [number, number, number];
  recipients: readonly string[];
}

export interface PossessionSwappedEvent {
  userId: string;
  entityId: string;
  previousEntityId: string;
}

export interface FormChangedEvent {
  instanceId: string;
  formId: string | null;
}

export interface AudioPlayEvent {
  sound: string;
  at?: readonly [number, number, number];
}

/** Request that the shell's audio engine resume its (browser-gesture-suspended) context; carries no payload. */
export type AudioResumeEvent = Record<string, never>;

/** Crossfade the procedural soundtrack to `theme` (null fades out), optionally transposing the incoming theme by `transpose` semitones. */
export interface AudioMusicEvent {
  theme: string | null;
  transpose?: number;
}

/**
 * Start (or idempotently keep) the retained, id-keyed audio loop `id` from catalog `sound`, optionally
 * anchored at world `at`. Restarting with the same `sound` does not restart the source (no click); a
 * different `sound` replaces it. Drives RPM-pitched engine loops and slip-scaled tire squeal (#1051).
 */
export interface AudioLoopStartEvent {
  id: string;
  sound: string;
  at?: readonly [number, number, number];
}

/**
 * Live-update the retained loop `id`: `rate` re-pitches it (1 = authored, the shell clamps to 0.25–4),
 * `gain` rescales its volume (0–1), and `at` repositions its emitter. Emitted every tick to track a
 * live signal (RPM, tire slip); the shell smooths rate/gain and ignores an unknown `id` (#1051).
 */
export interface AudioLoopSetEvent {
  id: string;
  rate?: number;
  gain?: number;
  at?: readonly [number, number, number];
}

/** Stop and dispose the retained loop `id`; an unknown `id` is ignored (#1051). */
export interface AudioLoopStopEvent {
  id: string;
}

export interface GameEventMap {
  "entity.died": EntityDiedEvent;
  "entity.floatText": EntityFloatTextEvent;
  "combat.telegraph": CombatTelegraphEvent;
  "combat.vfx": CombatVfxEvent;
  "combat.vfxInstance": CombatVfxInstanceEvent;
  "combat.telegraphCancelled": CombatTelegraphCancelledEvent;
  "combat.hitReaction": CombatHitReactionEvent;
  "loot.granted": LootGrantedEvent;
  "inventory.added": InventoryAddedEvent;
  "quest.accepted": QuestAcceptedEvent;
  "quest.updated": QuestUpdatedEvent;
  "quest.completed": QuestCompletedEvent;
  "social.friend.added": SocialFriendAddedEvent;
  "social.party.joined": SocialPartyJoinedEvent;
  "social.party.left": SocialPartyLeftEvent;
  "social.world.invited": SocialWorldInvitedEvent;
  "social.world.accepted": SocialWorldAcceptedEvent;
  "chat.message": ChatMessageEvent;
  "stat.levelUp": StatLevelUpEvent;
  "projectile.settled": ProjectileSettledEvent;
  "worldItem.dropped": WorldItemDroppedEvent;
  "worldItem.picked_up": WorldItemPickedUpEvent;
  "cosmetics.changed": CosmeticsChangedEvent;
  "emote.played": EmotePlayedEvent;
  "possession.swapped": PossessionSwappedEvent;
  "form.changed": FormChangedEvent;
  "audio.play": AudioPlayEvent;
  "audio.music": AudioMusicEvent;
  "audio.resume": AudioResumeEvent;
  "audio.loopStart": AudioLoopStartEvent;
  "audio.loopSet": AudioLoopSetEvent;
  "audio.loopStop": AudioLoopStopEvent;
  "entity.animation": EntityAnimationEvent;
}

export type GameEventHandler<TPayload> = (payload: TPayload) => void;

export interface GameEvents<TMap extends GameEventMap = GameEventMap> {
  on<TName extends keyof TMap>(name: TName, handler: GameEventHandler<TMap[TName]>): () => void;
  subscribe<TName extends keyof TMap>(name: TName, handler: GameEventHandler<TMap[TName]>): () => void;
  emit<TName extends keyof TMap>(name: TName, payload: TMap[TName]): void;
}

/**
 * A typed publish/subscribe bus for gameplay events that systems and HUDs subscribe to.
 *
 * @capability event-bus typed publish/subscribe bus for gameplay events
 */
export function createGameEvents<TMap extends GameEventMap = GameEventMap>(): GameEvents<TMap> {
  const listeners = new Map<keyof TMap, Set<GameEventHandler<never>>>();

  function on<TName extends keyof TMap>(name: TName, handler: GameEventHandler<TMap[TName]>): () => void {
    let set = listeners.get(name);
    if (!set) {
      set = new Set();
      listeners.set(name, set);
    }
    const entry = handler as GameEventHandler<never>;
    set.add(entry);
    return () => set.delete(entry);
  }

  return {
    on,
    subscribe: on,
    emit(name, payload) {
      const set = listeners.get(name);
      if (!set) return;
      for (const handler of set) (handler as GameEventHandler<TMap[typeof name]>)(payload);
    },
  };
}
