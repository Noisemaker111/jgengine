import {
  adapterOf,
  resolveAuthority,
  type MultiplayerAdapterConfig,
  type MultiplayerAuthority,
} from "@jgengine/core/runtime/adapter";
import type { PresencePoseRow } from "@jgengine/core/runtime/transport";

/** Transport kind declared by the game, or `"unknown"` when the config is unreadable. */
export type EditorNetworkAdapterKind = MultiplayerAdapterConfig["kind"] | "unknown";

/**
 * One online actor from a host-supplied presence feed. Fields mirror
 * {@link PresencePoseRow} so hosts can forward backend rows without inventing shape.
 */
export interface EditorNetworkPresenceActor {
  userId: string;
  position: { x: number; y: number; z: number };
  rotationY: number;
  rotationPitch?: number;
  lastSeenAt?: number;
}

/**
 * Optional live session identity when a multiplayer backend is attached.
 * Omit entirely when the host has no session — the panel reports offline honestly.
 */
export interface EditorNetworkSession {
  userId: string;
  /** Joined room/server id when known; `null` means joined but id not reported. */
  serverId?: string | null;
  feedActions?: readonly string[];
}

/**
 * Host-facing network inspection payload for the editor Network workspace.
 *
 * - Adapter fields come from the game definition (always real config).
 * - `session` is present only when the host attached a live multiplayer backend.
 * - `online` is `undefined` when the host has not supplied a presence feed; `[]` when
 *   the feed is connected but empty. Never fabricate actors.
 */
export interface EditorNetworkSnapshot {
  gameId: string;
  adapterKind: EditorNetworkAdapterKind;
  /** `null` for offline / single-player games. */
  authority: MultiplayerAuthority | null;
  /** Optional topology string from the adapter when declared. */
  topology?: string;
  /** Optional endpoint hint from the adapter (ws/socketio url, lan port, p2p room). */
  endpoint?: string;
  session?: EditorNetworkSession;
  /**
   * Online presence roster from the host.
   * - `undefined` — no feed supplied (honest empty / waiting).
   * - array — real rows only (may be empty).
   */
  online?: readonly EditorNetworkPresenceActor[];
  /** Wall-clock ms of the last presence update when the host tracks it. */
  updatedAt?: number;
}

/** Optional live presence/session injection from the editor host. */
export interface EditorNetworkPresenceInput {
  userId?: string;
  serverId?: string | null;
  feedActions?: readonly string[];
  online?: readonly PresencePoseRow[] | readonly EditorNetworkPresenceActor[];
  updatedAt?: number;
}

function endpointOf(adapter: MultiplayerAdapterConfig | null): string | undefined {
  if (adapter === null) return undefined;
  if (adapter.kind === "ws" || adapter.kind === "socketio") return adapter.url;
  if (adapter.kind === "lan") {
    const port = adapter.port ?? 8080;
    const path = adapter.path ?? "/ws";
    return `port ${port}${path}`;
  }
  if (adapter.kind === "p2p") return adapter.room;
  return undefined;
}

function topologyOf(adapter: MultiplayerAdapterConfig | null): string | undefined {
  if (adapter === null || adapter.kind === "offline") return undefined;
  return "topology" in adapter ? adapter.topology : undefined;
}

/**
 * Builds a Network workspace snapshot from the game's multiplayer config plus optional live
 * presence rows. Adapter fields always reflect declared config; presence is only included when
 * the host passes it.
 */
export function buildEditorNetworkSnapshot(args: {
  gameId: string;
  multiplayer: unknown;
  presence?: EditorNetworkPresenceInput;
}): EditorNetworkSnapshot {
  const adapter = adapterOf(args.multiplayer);
  const adapterKind: EditorNetworkAdapterKind = adapter?.kind ?? "unknown";
  const authority = resolveAuthority(args.multiplayer);
  const snapshot: EditorNetworkSnapshot = {
    gameId: args.gameId,
    adapterKind,
    authority,
  };
  const topology = topologyOf(adapter);
  if (topology !== undefined) snapshot.topology = topology;
  const endpoint = endpointOf(adapter);
  if (endpoint !== undefined) snapshot.endpoint = endpoint;

  const presence = args.presence;
  if (presence !== undefined) {
    if (typeof presence.userId === "string" && presence.userId.length > 0) {
      snapshot.session = {
        userId: presence.userId,
        ...(presence.serverId !== undefined ? { serverId: presence.serverId } : {}),
        ...(presence.feedActions !== undefined ? { feedActions: presence.feedActions } : {}),
      };
    }
    if (presence.online !== undefined) {
      snapshot.online = presence.online.map((row) => ({
        userId: row.userId,
        position: { x: row.position.x, y: row.position.y, z: row.position.z },
        rotationY: row.rotationY,
        ...(row.rotationPitch !== undefined ? { rotationPitch: row.rotationPitch } : {}),
        ...("lastSeenAt" in row && row.lastSeenAt !== undefined ? { lastSeenAt: row.lastSeenAt } : {}),
      }));
    }
    if (presence.updatedAt !== undefined) snapshot.updatedAt = presence.updatedAt;
  }

  return snapshot;
}

/** True when the snapshot represents a multiplayer-capable game (not offline/unknown-null). */
export function isNetworkMultiplayerConfigured(snapshot: EditorNetworkSnapshot): boolean {
  return snapshot.adapterKind !== "offline" && snapshot.adapterKind !== "unknown" && snapshot.authority !== null;
}
