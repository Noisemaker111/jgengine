import { computeFalloffGain, type AudioFalloffConfig } from "@jgengine/core/audio/audioFalloff";

export type VoiceChannelId = string;
export type VoiceMemberId = string;

export interface VoiceChannelDef {
  id: VoiceChannelId;
  /** Positional channels (proximity voice) attenuate by distance from the listener; non-positional channels (walkie/crew) play at flat gain regardless of distance. */
  positional: boolean;
  /** Only read when `positional` is true. */
  falloff?: AudioFalloffConfig;
  /** Flat gain multiplier applied on top of any falloff. Default 1. */
  gain?: number;
}

export interface VoicePosition {
  x: number;
  y: number;
  z: number;
}

export interface VoiceRoute {
  fromUserId: VoiceMemberId;
  channelId: VoiceChannelId;
  gain: number;
}

export interface VoiceChannelRouter {
  registerChannel(def: VoiceChannelDef): void;
  join(userId: VoiceMemberId, channelId: VoiceChannelId): void;
  leave(userId: VoiceMemberId, channelId: VoiceChannelId): void;
  leaveAll(userId: VoiceMemberId): void;
  updatePosition(userId: VoiceMemberId, position: VoicePosition): void;
  setMuted(userId: VoiceMemberId, muted: boolean): void;
  channelsOf(userId: VoiceMemberId): VoiceChannelId[];
  /** Every `{ fromUserId, channelId, gain }` the given listener should mix in right now — one route per shared channel, so a speaker heard on both a proximity and a walkie channel at once yields two independent-gain routes. */
  resolveRoutes(listenerUserId: VoiceMemberId): VoiceRoute[];
}

export function computeVoiceGain(def: VoiceChannelDef, distance: number | null): number {
  const base = def.gain ?? 1;
  if (!def.positional) return base;
  if (distance === null) return 0;
  return computeFalloffGain(distance, def.falloff) * base;
}

function distance3(a: VoicePosition, b: VoicePosition): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function createVoiceChannelRouter(channels?: readonly VoiceChannelDef[]): VoiceChannelRouter {
  const channelDefs = new Map<VoiceChannelId, VoiceChannelDef>();
  for (const def of channels ?? []) channelDefs.set(def.id, def);

  const membership = new Map<VoiceMemberId, Set<VoiceChannelId>>();
  const positions = new Map<VoiceMemberId, VoicePosition>();
  const muted = new Set<VoiceMemberId>();

  function memberChannels(userId: VoiceMemberId): Set<VoiceChannelId> {
    let set = membership.get(userId);
    if (set === undefined) {
      set = new Set();
      membership.set(userId, set);
    }
    return set;
  }

  return {
    registerChannel(def) {
      channelDefs.set(def.id, def);
    },
    join(userId, channelId) {
      memberChannels(userId).add(channelId);
    },
    leave(userId, channelId) {
      membership.get(userId)?.delete(channelId);
    },
    leaveAll(userId) {
      membership.delete(userId);
    },
    updatePosition(userId, position) {
      positions.set(userId, position);
    },
    setMuted(userId, isMuted) {
      if (isMuted) muted.add(userId);
      else muted.delete(userId);
    },
    channelsOf(userId) {
      return [...(membership.get(userId) ?? [])];
    },
    resolveRoutes(listenerUserId) {
      const listenerChannels = membership.get(listenerUserId) ?? new Set<VoiceChannelId>();
      if (listenerChannels.size === 0) return [];
      const listenerPosition = positions.get(listenerUserId) ?? null;
      const routes: VoiceRoute[] = [];
      for (const [speakerUserId, speakerChannels] of membership) {
        if (speakerUserId === listenerUserId || muted.has(speakerUserId)) continue;
        for (const channelId of speakerChannels) {
          if (!listenerChannels.has(channelId)) continue;
          const def = channelDefs.get(channelId);
          if (def === undefined) continue;
          const speakerPosition = positions.get(speakerUserId) ?? null;
          const distance =
            listenerPosition === null || speakerPosition === null
              ? null
              : distance3(listenerPosition, speakerPosition);
          routes.push({ fromUserId: speakerUserId, channelId, gain: computeVoiceGain(def, distance) });
        }
      }
      return routes;
    },
  };
}
