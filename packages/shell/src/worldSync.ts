import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { GameRuntimeFeeds } from "@jgengine/core/runtime/transport";
import type { WorldSyncFrame } from "@jgengine/core/runtime/transport";
import { createWorldMirror } from "@jgengine/core/runtime/worldMirror";
import type { WorldSnapshot } from "@jgengine/core/runtime/worldSnapshot";

/**
 * Client half of host-authoritative play: subscribe to the server-state channel and mirror each authoritative
 * `WorldSnapshot` (carried in `serverState`) into the local `ctx`, so the game renders the host's world instead
 * of a locally-simulated one. Pure and transport-agnostic — the backend's `feeds.subscribeServer` is the only
 * dependency; returns the unsubscribe. The shell attaches this (and gates its local sim) when the game's adapter
 * opts into `authority: "server"`.
  * @internal
  */
export function attachWorldSync(
  feeds: Pick<GameRuntimeFeeds, "subscribeServer" | "requestServerBaseline">,
  serverId: string,
  ctx: Pick<GameContext, "hydrate">,
): () => void {
  const mirror = createWorldMirror(ctx);
  return feeds.subscribeServer(serverId, (view) => {
    if (view === null) return;
    const frame = view.serverState as WorldSyncFrame | WorldSnapshot | null | undefined;
    if (frame === null || frame === undefined) return;
    if (isWorldSyncFrame(frame)) {
      if (frame.kind === "baseline") mirror.applyBaseline(frame.revision, frame.snapshot);
      else {
        mirror.applyDiff(frame.diff);
        if (mirror.needsResync()) feeds.requestServerBaseline?.(serverId);
      }
      return;
    }
    mirror.applyBaseline(view.revision, frame as WorldSnapshot);
  });
}

function isWorldSyncFrame(value: WorldSyncFrame | WorldSnapshot): value is WorldSyncFrame {
  return (
    typeof value === "object" &&
    value !== null &&
    (value.kind === "baseline" || value.kind === "diff")
  );
}
