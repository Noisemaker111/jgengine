import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { GameRuntimeFeeds } from "@jgengine/core/runtime/transport";
import { createWorldMirror } from "@jgengine/core/runtime/worldMirror";
import type { WorldSnapshot } from "@jgengine/core/runtime/worldSnapshot";

/**
 * Client half of host-authoritative play: subscribe to the server-state channel and mirror each authoritative
 * `WorldSnapshot` (carried in `serverState`) into the local `ctx`, so the game renders the host's world instead
 * of a locally-simulated one. Pure and transport-agnostic — the backend's `feeds.subscribeServer` is the only
 * dependency; returns the unsubscribe. The shell attaches this (and gates its local sim) when the game's adapter
 * opts into `authority: "server"`.
 */
export function attachWorldSync(
  feeds: Pick<GameRuntimeFeeds, "subscribeServer">,
  serverId: string,
  ctx: Pick<GameContext, "hydrate">,
): () => void {
  const mirror = createWorldMirror(ctx);
  return feeds.subscribeServer(serverId, (view) => {
    if (view === null) return;
    const snapshot = view.serverState as WorldSnapshot | null | undefined;
    if (snapshot === null || snapshot === undefined) return;
    mirror.applyBaseline(view.revision, snapshot);
  });
}
